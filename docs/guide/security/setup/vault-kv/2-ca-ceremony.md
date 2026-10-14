# 2. CA Ceremony (vault-kv)

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: vault-kv · Document version 1.0 (draft)

## Overview

Pivotal runs two certificate authorities. Each has a root key in AWS KMS and an intermediate CA in
Vault PKI:

| CA | Vault mount | Issues |
|---|---|---|
| DFSP CA | `pki_dfsp` | DFSP client certificates (leg 1) |
| Pivotal Hub-client CA | `pki_hub_client` | The web-inbound server certificate and the Hub callback certificate (leg 4) |

The two roots must stay separate. If they shared a key, a DFSP's client certificate would be trusted
on the Hub-facing side.

The ceremony script builds each root certificate, has AWS KMS sign it, creates the intermediate key
inside Vault, has the root sign the intermediate, and restores the Vault roles. The root private keys
never leave KMS.

## Objective

Create both CA roots in AWS KMS, install both intermediates in Vault, and publish the Pivotal
Hub-client CA root certificate to the cluster.

## Expected Outcome

- Two KMS keys (one per root). Their key policy names the ceremony identity as the only signer, and
  no IAM policy grants `kms:Sign` on them.
- Vault mounts `pki_dfsp` and `pki_hub_client`, each holding an intermediate signed by its own root.
- Vault roles `pki_dfsp/roles/dfsp-client`, `pki_hub_client/roles/web-inbound-server`,
  `pki_hub_client/roles/hub-callback-client` and `pki_hub_client/roles/pivotal-client`.
- Secret `pivotal-hub-client-ca` (key `ca.pem`) in the Pivotal namespace.
- The root certificates, intermediate certificates and root CRLs saved somewhere durable.

## Prerequisites

### Mandatory

- [1. Prerequisites](./1-prerequisites.md) passed, and the worksheet filled in.
- The AWS administrator is available for Steps 1 and 2.
- A ceremony host with Node 22, the `aws` CLI, `kubectl` pointed at the target cluster, and a
  checkout of the `pivotal` repository at the release tag.
- An IAM role (or user) for the ceremony that can do only `kms:Sign`, `kms:GetPublicKey` and
  `kms:DescribeKey`. Attach it to the ceremony host; do not copy administrator credentials onto it.
- A short-lived Vault token for the custodian, with the rights in [Step 5](#step-5-get-a-vault-token-for-the-ceremony).
- The Pivotal callback host (web-inbound's public host), for example `web-inbound.example.com`. The
  ceremony writes it into two Vault roles.

### Optional

- A CloudTrail alarm on `kms:Sign` for the root keys, created and tested before the ceremony.

> **Run this ceremony once per environment.** The script disables and re-creates both PKI mounts.
> Running it again replaces both intermediates, which is a CA re-key. To do that deliberately, follow
> [Re-key a Pivotal CA](../../runbooks/common/pivotal-ca-rekey.md).

## Steps

### Step 1. Create the two root keys in AWS KMS

- **Purpose:** Each root needs its own non-exportable signing key.
- **Action:** The AWS administrator creates two RSA 2048 signing keys and gives each an alias.
- **Command or Configuration:**

  ```bash
  aws sts get-caller-identity          # confirm the account
  aws configure get region             # confirm the region; KMS keys cannot move between regions

  create_root_key () {                 # $1 = alias, $2 = description
    KEY_ID=$(aws kms create-key \
      --key-usage SIGN_VERIFY \
      --key-spec RSA_2048 \
      --description "$2" \
      --query 'KeyMetadata.KeyId' --output text)
    aws kms create-alias --alias-name "$1" --target-key-id "$KEY_ID"
    echo "$1 -> $KEY_ID"
  }

  create_root_key alias/pivotal-dfsp-root-ca       "Pivotal DFSP CA root"
  create_root_key alias/pivotal-hub-client-root-ca "Pivotal Hub-client CA root"
  ```

- **Expected Result:** Two lines, each an alias and a key ID. Record both key IDs.
- **If It Fails:** `AccessDeniedException` means the administrator identity lacks `kms:CreateKey` or
  `kms:CreateAlias`. `AlreadyExistsException` on the alias means a key with that alias exists: check
  whether it is a previous root before you do anything else.

> Do not let a reconcile tool (Terraform, Argo CD) own these keys. A root key must never be
> recreated or deleted by automation.

### Step 2. Grant the ceremony identity signing rights

- **Purpose:** The ceremony identity must be able to sign with each root key, and nothing else.
- **Action:** Add this statement to the key policy of **both** keys. `put-key-policy` replaces the
  whole policy, so start from the current policy and keep the account's administrator statement.
- **Command or Configuration:**

  ```bash
  aws kms get-key-policy --key-id <KEY_ID> --policy-name default --query Policy --output text > policy.json
  # edit policy.json: add the statement below
  aws kms put-key-policy --key-id <KEY_ID> --policy-name default --policy file://policy.json
  ```

  ```json
  {
    "Sid": "CeremonyMaySignOnly",
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::<ACCOUNT_ID>:role/<CEREMONY_ROLE>" },
    "Action": ["kms:Sign", "kms:GetPublicKey", "kms:DescribeKey"],
    "Resource": "*"
  }
  ```

- **Expected Result:** `aws kms get-key-policy` shows the statement on both keys.
- **If It Fails:** `MalformedPolicyDocumentException` usually means the principal ARN is wrong or the
  JSON is not valid.

> **This statement grants; it does not restrict.** The default key policy's administrator statement
> (`arn:aws:iam::<ACCOUNT_ID>:root`, `kms:*`) lets IAM policies grant access too. So any IAM principal
> whose own IAM policy allows `kms:Sign` on these keys can also sign with a root. Make sure no IAM
> policy grants `kms:Sign` (or `kms:*`) on these keys to anyone else, including Pivotal services and
> Vault identities, and rely on the CloudTrail alarm on `kms:Sign` to detect any use.

### Step 3. Prepare the ceremony host

- **Purpose:** The script needs `node-forge` from the repository's dependencies.
- **Action:** Install dependencies in the repository checkout and confirm the module loads.
- **Command or Configuration:**

  ```bash
  cd <PIVOTAL_REPO>
  git describe --tags                 # must print the release tag you are installing
  npm ci
  node -e "require('node-forge'); console.log('ok')"
  ```

- **Expected Result:** The release tag, then `ok`.
- **If It Fails:** `Cannot find module 'node-forge'` means `npm ci` did not finish or you are not in
  the repository root.

### Step 4. Confirm the ceremony identity

- **Purpose:** The script must sign with the ceremony identity, not an administrator.
- **Action:** Check the identity and read both public keys.
- **Command or Configuration:**

  ```bash
  aws sts get-caller-identity
  aws kms get-public-key --key-id alias/pivotal-dfsp-root-ca --query KeySpec
  aws kms get-public-key --key-id alias/pivotal-hub-client-root-ca --query KeySpec
  kubectl config current-context
  kubectl -n <VAULT_NAMESPACE> get pod <VAULT_POD>
  ```

- **Expected Result:** The ceremony role's ARN; `"RSA_2048"` twice; the target cluster's context;
  the Vault pod `Running`.
- **If It Fails:** If `get-caller-identity` shows an administrator, stop and fix the host's
  credentials. `aws kms list-aliases` being denied is expected for the ceremony role.

### Step 5. Get a Vault token for the ceremony

- **Purpose:** The script runs `vault` commands inside the Vault pod with this token.
- **Action:** The Vault administrator issues a short-lived token (for example one hour) with these
  rights, and gives it to the custodian.

  | Path | Capabilities |
  |---|---|
  | `sys/mounts/pki_dfsp`, `sys/mounts/pki_hub_client` | `create`, `update`, `delete`, `sudo` |
  | `pki_dfsp/intermediate/*`, `pki_hub_client/intermediate/*` | `create`, `update` |
  | `pki_dfsp/roles/*`, `pki_hub_client/roles/*` | `create`, `update` |

  As a policy:

  ```hcl
  path "sys/mounts/pki_dfsp"              { capabilities = ["create", "update", "delete", "sudo"] }
  path "sys/mounts/pki_hub_client"        { capabilities = ["create", "update", "delete", "sudo"] }
  path "pki_dfsp/intermediate/*"          { capabilities = ["create", "update"] }
  path "pki_hub_client/intermediate/*"    { capabilities = ["create", "update"] }
  path "pki_dfsp/roles/*"                 { capabilities = ["create", "update"] }
  path "pki_hub_client/roles/*"           { capabilities = ["create", "update"] }
  ```

- **Expected Result:** The custodian holds a token that expires soon after the ceremony.
- **If It Fails:** See Step 6, "If It Fails".

### Step 6. Run the ceremony script

- **Purpose:** Create both CAs.
- **Action:** Set the inputs and run the script from the repository root. Write the outputs outside
  the repository.
- **Command or Configuration:**

  | Variable | Required | Meaning | Default |
  |---|---|---|---|
  | `WEB_INBOUND_HOST` | Yes | The Pivotal callback host. The script stops if it is empty. | — |
  | `VAULT_DEV_ROOT_TOKEN` | Yes, in practice | The Vault token from Step 5. Despite the name, use the short-lived ceremony token. | `root-dev` (a development token; fails against a real Vault) |
  | `DFSP_KEY_ALIAS` | Yes, in practice | KMS alias of the DFSP CA root | `alias/pivotal-dfsp-root-ca-rehearsal` |
  | `HUB_CLIENT_KEY_ALIAS` | Yes, in practice | KMS alias of the Pivotal Hub-client CA root | `alias/pivotal-hub-client-root-ca-rehearsal` |
  | `VAULT_NS` | No | Namespace of the Vault pod | `vault` |
  | `VAULT_POD` | No | Vault pod name | `vault-0` |
  | `PIVOTAL_NS` | No | Namespace that receives the published root | `pivotal` |
  | `CEREMONY_OUT` | No | Output directory | `$TMPDIR/pivotal-ceremony-kms` |

  ```bash
  cd <PIVOTAL_REPO>
  export WEB_INBOUND_HOST=<PIVOTAL_CALLBACK_HOST>
  export DFSP_KEY_ALIAS=alias/pivotal-dfsp-root-ca
  export HUB_CLIENT_KEY_ALIAS=alias/pivotal-hub-client-root-ca
  export VAULT_NS=<VAULT_NAMESPACE> VAULT_POD=<VAULT_POD> PIVOTAL_NS=pivotal
  export CEREMONY_OUT="$HOME/pivotal-ceremony-out"
  read -r -s -p "Vault token: " VAULT_DEV_ROOT_TOKEN; echo; export VAULT_DEV_ROOT_TOKEN

  node docs/operations/kms/setup/scripts/ceremony-kms.js
  ```

- **Expected Result:** Output like this (aliases and namespace are yours):

  ```text
  -- Pivotal Hub Client CA ------------------------------------
    root signed by KMS: alias/pivotal-hub-client-root-ca
    intermediate signed by the KMS root
    intermediate installed in Vault mount 'pki_hub_client'
    role restored: pki_hub_client/roles/pivotal-client
    role restored: pki_hub_client/roles/web-inbound-server
    role restored: pki_hub_client/roles/hub-callback-client
    root CRL signed by KMS
    root published to Secret pivotal/pivotal-hub-client-ca

  -- Pivotal DFSP-Facing CA ------------------------------------
    root signed by KMS: alias/pivotal-dfsp-root-ca
    intermediate signed by the KMS root
    intermediate installed in Vault mount 'pki_dfsp'
    role restored: pki_dfsp/roles/dfsp-client
    root CRL signed by KMS

  Roots are in AWS KMS. Public certificates and CRLs under <CEREMONY_OUT>
  ```

  `<CEREMONY_OUT>/pki_hub_client/` and `<CEREMONY_OUT>/pki_dfsp/` each hold `root.pem`,
  `inter.pem` and `root.crl`.

- **If It Fails:**

  | Message | Cause | Fix |
  |---|---|---|
  | `WEB_INBOUND_HOST is not set.` | Variable missing | Set it and run again |
  | `AccessDeniedException` from `kms sign` or `kms get-public-key` | Wrong identity, wrong region, or the key policy from Step 2 is missing | Fix the identity or policy; set `AWS_REGION` if needed |
  | `permission denied` from a `vault` command | Token missing, expired, or lacks a right from Step 5 | Get a new token; run again |
  | `pods "<VAULT_POD>" not found` | `VAULT_NS` or `VAULT_POD` wrong, or wrong cluster context | Fix the variables or context |
  | `path is already in use` when enabling a mount | The script could not disable the old mount: the token lacks `delete` on `sys/mounts/<MOUNT>`. The script hides that error. | Give the token the rights in Step 5; run again |

  The script stops at the first error. Running it again from the start is safe **during the
  ceremony**, before any certificate has been issued: it disables and re-creates the mounts.

### Step 7. Check the `pivotal-hub-client-ca` Secret

- **Purpose:** trust-manager reads the Pivotal Hub-client CA root from the Secret
  `pivotal-hub-client-ca` (key `ca.pem`) and registers it with MCM. The script creates or updates it
  (`root published to Secret pivotal/pivotal-hub-client-ca` in Step 6).
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal get secret pivotal-hub-client-ca -o jsonpath='{.data.ca\.pem}' | base64 -d \
    | openssl x509 -noout -fingerprint -sha256
  openssl x509 -in "$CEREMONY_OUT/pki_hub_client/root.pem" -noout -fingerprint -sha256
  ```

- **Expected Result:** the two fingerprints are identical.
- **If It Fails:**
  - **Step 6 stopped at publishing the Secret** (a `kubectl` error right after the Hub-client CA's
    root CRL line): the script stops there, so the DFSP CA was not created either. Fix `kubectl`
    access to the cluster and run Step 6 again.
  - **The Secret is in another namespace:** the script used `PIVOTAL_NS`. Create it in `pivotal` from
    the same file:
    `kubectl -n pivotal create secret generic pivotal-hub-client-ca --from-file=ca.pem="$CEREMONY_OUT/pki_hub_client/root.pem" --dry-run=client -o yaml | kubectl apply -f -`.

### Step 8. Save the public outputs and clean up

- **Purpose:** Keep what you will need later; remove what you will not.
- **Action:**
  1. Copy `root.pem`, `inter.pem` and `root.crl` from both directories to durable storage (your
     change record or configuration repository). They are public.
  2. Revoke the Vault token, clear it from the shell, and delete the output directory.
  3. Remove the ceremony identity's permissions and terminate the ceremony host.
- **Command or Configuration:**

  ```bash
  VAULT_TOKEN="$VAULT_DEV_ROOT_TOKEN" vault token revoke -self   # needs VAULT_ADDR set to a reachable Vault
  unset VAULT_DEV_ROOT_TOKEN
  rm -rf "$CEREMONY_OUT"
  ```

- **Expected Result:** `Success! Revoked token (if it existed)`; the directory is gone.
- **If It Fails:** If you cannot reach Vault from the host, ask the Vault administrator to revoke
  the token. It expires on its own at its TTL.

## Verification

Run the certificate checks before Step 8 deletes the output directory, or against your saved copies.
Run checks 5 and 6 as the Vault administrator: the ceremony token cannot list or read roles.

| # | Check | Command | Pass |
|---|---|---|---|
| 1 | Each intermediate chains to its own root | `openssl verify -CAfile pki_dfsp/root.pem pki_dfsp/inter.pem` and the same for `pki_hub_client` | `OK` twice |
| 2 | The intermediates are CAs limited to one level | `openssl x509 -in pki_dfsp/inter.pem -noout -text \| grep -A1 'Basic Constraints'` | `CA:TRUE, pathlen:0` |
| 3 | The two roots are different keys | `openssl x509 -noout -fingerprint -sha256 -in pki_dfsp/root.pem` and for `pki_hub_client/root.pem` | Different fingerprints |
| 4 | Each CRL is signed by its root | `openssl crl -in pki_dfsp/root.crl -CAfile pki_dfsp/root.pem -noout` | `verify OK` |
| 5 | Vault roles exist | `vault list pki_hub_client/roles` and `vault list pki_dfsp/roles` | `hub-callback-client`, `pivotal-client`, `web-inbound-server`; and `dfsp-client` |
| 6 | The DFSP CA ignores names in a request | `vault read pki_dfsp/roles/dfsp-client` | `use_csr_common_name false` and `use_csr_sans false` |
| 7 | The published root is the right one | `kubectl -n pivotal get secret pivotal-hub-client-ca -o jsonpath='{.data.ca\.pem}' \| base64 -d \| openssl x509 -noout -subject -fingerprint -sha256` | Subject `CN = Pivotal Hub Client CA Root`; fingerprint equals check 3's `pki_hub_client` value |

**Negative tests** (run as the Vault administrator, with `VAULT_ADDR` set):

1. **A DFSP cannot name another participant.** Sign a request that claims a different name and check
   that the certificate carries the name Pivotal supplies:

   ```bash
   openssl req -new -newkey rsa:2048 -nodes -keyout /tmp/t.key -subj "/CN=SOMEONE-ELSE" -out /tmp/t.csr
   vault write -field=certificate pki_dfsp/sign/dfsp-client csr=@/tmp/t.csr common_name=<TEST_DFSP_ID> \
     | openssl x509 -noout -subject
   rm -f /tmp/t.key /tmp/t.csr
   ```

   Pass: the subject's `CN` is `<TEST_DFSP_ID>`, not `SOMEONE-ELSE`. The role does not store issued
   certificates, so nothing needs cleaning up in Vault.

2. **The web-inbound role refuses other hosts.** Repeat with
   `pki_hub_client/sign/web-inbound-server` and `common_name=other.example.com`. Pass: Vault refuses
   the request because the common name is not allowed by the role.

## Troubleshooting

- The failures in Step 6, "If It Fails".
- [Vault](../../troubleshooting.md#vault)

## Rollback or Recovery

- **During the ceremony, before anything is issued:** run the script again. It replaces both mounts.
- **The root private keys cannot be exported or recovered.** If a root key is deleted, every
  certificate under it stops verifying and the ceremony must be repeated with new keys, followed by
  a re-key of everything issued.
- **Abandoning a key:** `aws kms schedule-key-deletion --key-id <KEY_ID> --pending-window-in-days 30`.
  Until the window ends, `aws kms cancel-key-deletion --key-id <KEY_ID>` undoes it. After that it is
  permanent.
- **Replacing a CA after setup:** follow [Re-key a Pivotal CA](../../runbooks/common/pivotal-ca-rekey.md).

## References

- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Vault reference](../../reference/vault.md)
- [Kubernetes resources](../../reference/kubernetes-resources.md)
- Script: `docs/operations/kms/setup/scripts/ceremony-kms.js` in the `pivotal` repository
- Next: [3. Vault](./3-vault.md)

# Run the CA Ceremony

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: pkcs11 · Document version 1.0 (draft)

## Overview

The CA ceremony creates Pivotal's two certificate authorities:

| | DFSP CA | Pivotal Hub-client CA |
|---|---|---|
| Vault mount | `pki_dfsp` | `pki_hub_client` |
| Signs | DFSP client certificates | The web-inbound server certificate and the Hub callback certificate |
| Root key owned by | crypto user `cu_ca_dfsp_root` | crypto user `cu_ca_hub_root` |

For each CA, the script `ceremony-hsm.sh`, which ships in the HSM admin pod's image:

1. generates the root key pair **inside CloudHSM**, marked non-extractable;
2. builds the self-signed root certificate with OpenSSL and has the HSM sign it;
3. has Vault generate the intermediate CA key and a CSR (the intermediate key stays in Vault);
4. has the HSM-held root sign that CSR, and installs the result in Vault;
5. creates the Vault roles that issue certificates;
6. signs an empty root CRL, to prove the root key can be used again for revocation;
7. checks the chain.

Run it **once per environment**, in one sitting, with two custodians and a witness.

> **Never run the ceremony on a live environment.** It disables and re-creates both Vault PKI
> mounts. Every certificate issued before then stops chaining, and every DFSP must be issued a new
> certificate.

## Objective

Have both root CAs in CloudHSM, both intermediate CAs in Vault, every issuing role in place, and
the public certificates saved off the HSM admin pod.

## Expected Outcome

- Vault mounts `pki_dfsp` and `pki_hub_client` exist and can sign certificates.
- Roles exist: `pki_dfsp/roles/dfsp-client`, `pki_hub_client/roles/pivotal-client`,
  `pki_hub_client/roles/web-inbound-server` and `pki_hub_client/roles/hub-callback-client`.
- The two root keys are different keys, and neither can be exported.
- The ceremony output (root and intermediate certificates, root CRLs) is saved in your change
  record.
- The Secret `pivotal-hub-client-ca` holds the Pivotal Hub-client root certificate.

## Prerequisites

### Mandatory

| Item | Notes |
|---|---|
| [Prepare the CloudHSM cluster](2-hsm.md) completed | Activated cluster, two HSMs |
| An [HSM admin pod](hsm-admin-pod.md) session open (that page's Steps 4 and 5) | The ceremony runs inside it. The image carries the script, the CloudHSM CLI, the PKCS#11 library, `libengine-pkcs11-openssl` and the Vault CLI |
| A Crypto Officer (custodian) for Step 1 | Creates the two ceremony crypto users |
| **Two custodians**, one per root CA | Each sets and keeps one ceremony crypto-user password. Nobody holds both |
| A witness | Records the ceremony |
| A Vault token that can manage the two PKI mounts | See Step 2 |
| `WEB_INBOUND_HOST`: web-inbound's public callback host name | `<PIVOTAL_CALLBACK_HOST>` from the [shared worksheet](../common/hub-operator-and-worksheet.md#step-3-fill-in-the-worksheet). The script stops if it is not set |
| The Pivotal source at the release you deploy | Optional: to compare the script's checksum (Step 3) |

### Optional

| Item | Notes |
|---|---|
| A management quorum on the root keys | Not used by the script. Decide before the ceremony; it is set only when a key is generated |

## Steps

Steps 1, 2, 3 and 5 run **inside the HSM admin pod**. Steps 6, 7 and 8 run on **your workstation**,
with the pod's name in `POD`:

```bash
POD=$(kubectl -n pivotal get pod -l app.kubernetes.io/component=hsm-tools -o jsonpath='{.items[0].metadata.name}')
```

### Step 1. Create the two ceremony crypto users

- **Purpose:** each root key is owned by its own crypto user, so one compromised password exposes
  one CA, not both. Ownership is set when a key is created and cannot be moved later.
- **Action:** a Crypto Officer logs in for this shell. Then each custodian types their own new
  password at the prompt for their user.
- **Command or Configuration:**

  ```bash
  read -r -p "Crypto Officer username [admin]: " CO_USER; CO_USER=${CO_USER:-admin}
  read -r -s -p "Crypto Officer password: " CO_PASS; echo
  export CLOUDHSM_ROLE=admin CLOUDHSM_PIN="${CO_USER}:${CO_PASS}"
  unset CO_PASS

  cloudhsm-cli user create --username cu_ca_hub_root  --role crypto-user   # custodian 1 types the password
  cloudhsm-cli user create --username cu_ca_dfsp_root --role crypto-user   # custodian 2 types the password
  cloudhsm-cli user list

  unset CLOUDHSM_PIN CLOUDHSM_ROLE CO_USER
  ```

- **Expected Result:** `user list` shows both users with role `crypto-user`.
- **If It Fails:** see [Prepare the CloudHSM cluster: Troubleshooting](2-hsm.md#troubleshooting).

> **These two passwords never go into Vault, a Secret, an environment variable of any workload, or
> a file.** Every other crypto user is stored in Vault so a pod can read it. These two are the
> exception: no running service may be able to use a root key. Each custodian keeps their password
> in their own password manager or sealed envelope.
>
> A password cannot be read back. A Crypto Officer can only reset it. If a custodian loses theirs,
> the root key still exists but nobody can use it, for example to sign a CRL.

### Step 2. Check the Vault token

- **Purpose:** the ceremony disables and re-enables both PKI mounts. A token that cannot do this
  fails partway through, after a root key already exists.
- **Action:** in the pod, set the token, then check its capabilities. `VAULT_ADDR` is already set
  from `hsmTools.vaultAddress`. If your Vault runs in HA mode, point it at the `vault-active`
  service for this session, so every write goes to the leader.
- **Command or Configuration:**

  ```bash
  export VAULT_ADDR=http://vault-active.vault.svc.cluster.local:8200   # HA only
  read -r -s -p "Vault token: " VAULT_TOKEN; echo; export VAULT_TOKEN

  vault token capabilities sys/mounts/pki_dfsp
  vault token capabilities sys/mounts/pki_hub_client
  vault token capabilities pki_dfsp/roles/dfsp-client
  vault token capabilities pki_hub_client/roles/web-inbound-server

  unset VAULT_TOKEN
  ```

- **Expected Result:** the two `sys/mounts` lines include `create`, `update`, `delete` and `sudo`;
  the two `roles` lines include `create` and `update`. Or every line prints `root`.
- **If It Fails:** give the token a policy like this one, or use a root token for the ceremony
  only:

  ```hcl
  path "sys/mounts/pki_dfsp"              { capabilities = ["create", "update", "delete", "sudo"] }
  path "sys/mounts/pki_hub_client"        { capabilities = ["create", "update", "delete", "sudo"] }
  path "pki_dfsp/intermediate/*"          { capabilities = ["create", "update"] }
  path "pki_hub_client/intermediate/*"    { capabilities = ["create", "update"] }
  path "pki_dfsp/roles/*"                 { capabilities = ["create", "update"] }
  path "pki_hub_client/roles/*"           { capabilities = ["create", "update"] }
  ```

  This is the same policy as the `vault-kv` ceremony: both scripts run the same Vault commands.

The script asks for the token itself, which is why it is unset again here.

### Step 3. Check the ceremony script

- **Purpose:** the ceremony must run the script of the release you deploy. It ships in the image at
  `/usr/local/bin/ceremony-hsm.sh`.
- **Command or Configuration:** in the pod, and optionally on your workstation from the Pivotal
  source at that release:

  ```bash
  sha256sum /usr/local/bin/ceremony-hsm.sh
  shasum -a 256 docs/operations/hsm/setup/scripts/ceremony-hsm.sh   # workstation; sha256sum on Linux
  ```

- **Expected Result:** the two hashes are identical.
- **If It Fails:** the image tag does not match the release. Fix `hsmTools.image.tag`, end the
  session and start a new one.

### Step 4. Brief the participants

- **Action:** before starting, confirm:
  - both custodians are present and know which user they own (`cu_ca_hub_root`, `cu_ca_dfsp_root`);
  - the witness is recording;
  - `WEB_INBOUND_HOST` is the correct public host (it is written into two Vault roles);
  - this environment has no live DFSP certificates (see the warning in the Overview).

### Step 5. Run the ceremony

- **Purpose:** create both CAs.
- **Action:** in the pod, run the script. It prompts, in order, for:
  1. the Hub-client root crypto user and its password (custodian 1);
  2. the DFSP-facing root crypto user and its password (custodian 2);
  3. the Vault token.
- **Command or Configuration:**

  ```bash
  WEB_INBOUND_HOST=<PIVOTAL_CALLBACK_HOST> ceremony-hsm.sh
  ```

- **Expected Result:** for **each** CA, these lines appear:

  ```
  root keypair generated in CloudHSM (non-extractable)
  root certificate: ...
  intermediate CSR generated in Vault
  intermediate signed by the HSM-held root
  intermediate installed in Vault mount '...'
  issuing role restored: ...
  root CRL signed: ...
  chain verified: intermediate → root
  ```

  Between the two CAs, these two lines appear:

  ```
  role restored: pki_hub_client/roles/web-inbound-server
  role restored: pki_hub_client/roles/hub-callback-client
  ```

  The script ends with `Done. Both roots are in CloudHSM and cannot be exported.`, followed by the
  commands to publish the Hub-facing root. Step 6 does the same, and also copies out the rest of the
  output.
- **If It Fails:**
  - `WEB_INBOUND_HOST is not set`: the script stopped before asking for anything. Set it and run
    again.
  - `REFUSING: both roots would be owned by the same crypto user`: enter a different user for each
    CA.
  - The script exits right after a `── <CA name> ──` header, with no further line: that CA's
    ceremony crypto-user name or password is wrong (the script hides that error). For the DFSP CA
    this happens after the whole Hub-client CA section. Check the login with
    `CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN=<USER>:<PASSWORD> /opt/cloudhsm/bin/cloudhsm-cli key list`.
  - The script stops partway: read the last line. Fix the cause and run the script again. A root
    key that already exists is reused (`root keypair already present — not regenerating`), and both
    mounts are rebuilt from the start.

These messages from OpenSSL are expected and **do not** mean failure: `Unable to enumerate private
keys`, and a `thread '<unnamed>' panicked … Tokio context` message at the end of an OpenSSL call.
Judge the run by the script's own lines above.

### Step 6. Create the Pivotal Hub-client CA Secret

- **Purpose:** trust-manager registers this root certificate with MCM, so the Hub trusts the
  certificates Pivotal's Hub-client CA signs.
- **Action:** from your workstation. The pod has no Kubernetes access, so the script prints commands
  to publish the root instead of running them. The commands below do the same, and also copy out the
  rest of the output for Step 7. `$POD` is the admin pod's name, as the script's first printed
  command sets it. Use the **root certificate only**, not the chain.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal cp "$POD:/tmp/pivotal-ceremony-hsm/out" ./ceremony-out
  kubectl -n pivotal create secret generic pivotal-hub-client-ca \
    --from-file=ca.pem=./ceremony-out/pki_hub_client/root.pem --dry-run=client -o yaml | kubectl apply -f -
  ```

- **Expected Result:** `secret/pivotal-hub-client-ca created` (or `configured` on a re-run).

### Step 7. Save the ceremony output

- **Purpose:** the working directory is in the pod's `/tmp`, which goes when the session ends. Its contents are
  public certificates, but losing them means running the ceremony again.
- **Action:** check the copy from Step 6 is complete, then store `./ceremony-out` with your change
  record.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal exec "$POD" -- sh -c 'cd /tmp/pivotal-ceremony-hsm/out && sha256sum */root.pem */inter.pem */root.crl'
  (cd ceremony-out && shasum -a 256 */root.pem */inter.pem */root.crl)
  ```

- **Expected Result:** the six hashes match.

| File | What it is | Used in |
|---|---|---|
| `pki_dfsp/root.pem` | DFSP CA root certificate | Given to DFSPs for their records |
| `pki_dfsp/inter.pem` | DFSP CA intermediate certificate | The DFSP-facing gateway's trust anchor: [Enable the DFSP-facing side](../common/enable-dfsp-facing.md) |
| `pki_hub_client/root.pem` | Pivotal Hub-client CA root certificate | Step 6 |
| `*/root.crl` | Empty root CRLs | Kept for revocation of an intermediate |

### Step 8. Record the ceremony and clean up

- **Action:**
  1. The witness records: date, people present, which custodian owns which crypto user, the root
     certificate fingerprints and expiry dates:

     ```bash
     openssl x509 -in ceremony-out/pki_dfsp/root.pem -noout -fingerprint -sha256 -enddate
     openssl x509 -in ceremony-out/pki_hub_client/root.pem -noout -fingerprint -sha256 -enddate
     ```

  2. End the session: [Prepare the HSM admin pod: End the session](hsm-admin-pod.md#step-6-end-the-session).
     Scaling to zero deletes the pod's `/tmp`, which holds the ceremony's working files.
- **Expected Result:** the record is filed. Roots are valid for 10 years and intermediates for
  5 years; put both expiry dates where someone will be reminded.

## Verification

Run in the HSM admin pod unless noted.

**1. The two roots are different keys** (workstation):

```bash
openssl x509 -in ceremony-out/pki_hub_client/root.pem -noout -pubkey | shasum -a 256
openssl x509 -in ceremony-out/pki_dfsp/root.pem       -noout -pubkey | shasum -a 256
```

Expected: two different hashes. **If they match, stop.** The two trust domains share a key and the
ceremony must be redone with separate users.

**2. The root keys cannot be exported.** Each custodian logs in as their own user:

```bash
read -r -s -p "cu_ca_hub_root password: " P; echo
CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN="cu_ca_hub_root:${P}" \
  cloudhsm-cli key list --verbose --filter attr.label=pki_hub_client-root
unset P
```

Expected: one key, with `"extractable": false` and `"sign": true`. Repeat with `cu_ca_dfsp_root`
and the label `pki_dfsp-root`.

**3. The roles have the safe settings:**

```bash
export VAULT_ADDR=http://vault-active.vault.svc.cluster.local:8200   # HA only; otherwise keep the pod's VAULT_ADDR
read -r -s -p "Vault token: " VAULT_TOKEN; echo; export VAULT_TOKEN
vault read pki_dfsp/roles/dfsp-client | grep use_csr
vault read pki_hub_client/roles/web-inbound-server | grep -E 'allowed_domains|use_csr'
vault read pki_hub_client/roles/hub-callback-client | grep -E 'allowed_domains|use_csr'
```

Expected: `use_csr_common_name false` and `use_csr_sans false` on every role, and `allowed_domains`
showing `[<PIVOTAL_CALLBACK_HOST>]`.

**4. Vault signs a certificate that chains to the HSM-held root:**

```bash
openssl req -new -newkey rsa:2048 -nodes -keyout /tmp/probe.key -subj "/CN=probe.example.com" -out /tmp/probe.csr
vault write -field=certificate pki_dfsp/sign/dfsp-client csr=@/tmp/probe.csr common_name=probe.example.com > /tmp/probe.pem
vault read -field=certificate pki_dfsp/cert/ca > /tmp/inter.pem
openssl verify -partial_chain -CAfile /tmp/inter.pem /tmp/probe.pem
rm -f /tmp/probe.* /tmp/inter.pem; unset VAULT_TOKEN
```

Expected: `/tmp/probe.pem: OK`.

**Negative test:** the DFSP CA ignores the name inside the CSR. Sign a CSR whose subject names
another participant, with `common_name=dfsp1`:

```bash
openssl req -new -newkey rsa:2048 -nodes -keyout /tmp/n.key -subj "/CN=someone-else" -out /tmp/n.csr
vault write -field=certificate pki_dfsp/sign/dfsp-client csr=@/tmp/n.csr common_name=dfsp1 \
  | openssl x509 -noout -subject
rm -f /tmp/n.*
```

Expected: the subject's `CN` is `dfsp1`, not `someone-else`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `-engine pkcs11` fails, naming the engine | `libengine-pkcs11-openssl` missing: the pod was built by hand without it | [HSM admin pod: fallback](hsm-admin-pod.md#fallback-a-hand-built-pod) |
| Vault step fails with `permission denied` | The token cannot manage the PKI mounts | Step 2 |
| The script stops after `root keypair generated` | A Vault write failed, often a standby node | Use `vault-active` as `VAULT_ADDR` and run again |
| `key list` shows no key for the root label | Logged in as the wrong ceremony user | Each root is visible only to its own user |
| cert-manager later reports `unknown role` | The Vault roles were removed after the ceremony | Run Verification 3. Recreate missing roles from the values in [`ceremony-hsm.sh`](../../../../operations/hsm/setup/scripts/ceremony-hsm.sh) |

More: [Troubleshooting: HSM](../../troubleshooting.md#hsm) and
[Troubleshooting: Vault](../../troubleshooting.md#vault).

## Rollback or Recovery

- **Before any certificate has been issued:** run the ceremony again. Existing root keys are reused,
  and both mounts are rebuilt.
- **To start completely fresh:** each custodian deletes their own root key pair (as the owner:
  `cloudhsm-cli key delete --filter attr.label=<MOUNT>-root` and `--filter attr.label=<MOUNT>-root-pub`),
  then run the ceremony again.
- **After certificates have been issued:** the ceremony cannot be undone without replacing every
  certificate. Do not re-run it. Changing a CA on a live environment is a separate procedure:
  [Pivotal CA re-key](../../runbooks/common/pivotal-ca-rekey.md).
- **A root key cannot be recovered** if both HSMs and every cluster backup are lost. It cannot be
  exported by design.

## References

- [`ceremony-hsm.sh`](../../../../operations/hsm/setup/scripts/ceremony-hsm.sh)
- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Vault reference](../../reference/vault.md)
- [Kubernetes resources](../../reference/kubernetes-resources.md)
- Next: [Configure Vault](4-vault.md)

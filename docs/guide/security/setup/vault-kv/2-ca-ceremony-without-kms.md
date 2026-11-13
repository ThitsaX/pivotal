# 2. CA Ceremony without AWS KMS (vault-kv)

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 and later · Profile: vault-kv · Document version 1.0 (draft)

## Overview

This page replaces [2. CA ceremony](./2-ca-ceremony.md) for a deployment that does not use AWS KMS,
for example an on-premises deployment. Use one of the two pages, not both.

In the `vault-kv` profile, AWS KMS has one job: it holds the two CA root keys and signs with them
during the ceremony. No Pivotal service calls KMS at run time. Without KMS, the root keys are kept in
one of two places:

| Where the roots are kept | How it works | Fits |
|---|---|---|
| **In Vault** | Each root is a Vault PKI mount. Vault creates the root key and signs the intermediate. | Non-production environments. Anyone with administrator rights on Vault can also use the roots. |
| **Offline** | Each root key is created with `openssl` on an air-gapped machine and stored encrypted in safes. It signs the intermediate there. | Production. The root keys never touch a networked machine. |

In both cases the result in Vault is the same as after the KMS ceremony: the intermediates in
`pki_dfsp` and `pki_hub_client`, the same Vault roles, and the same Secret `pivotal-hub-client-ca`.
Pages 3 onwards, the shared `common/` pages and the runbooks apply unchanged.

The two roots must stay separate. If they shared a key, a DFSP's client certificate would be trusted
on the Hub-facing side.

## Objective

Create both CA roots without AWS KMS, install both intermediates in Vault, and publish the Pivotal
Hub-client CA root certificate to the cluster.

## Expected Outcome

- Vault mounts `pki_dfsp` and `pki_hub_client`, each holding an intermediate signed by its own root.
- Roots in Vault: two more mounts, `pki_dfsp_root` and `pki_hub_client_root`, each holding a root.
- Offline roots: two CA folders, each with an encrypted root key, stored on two encrypted media in
  separate safes.
- Vault roles `pki_dfsp/roles/dfsp-client`, `pki_hub_client/roles/web-inbound-server` and
  `pki_hub_client/roles/hub-callback-client`.
- Secret `pivotal-hub-client-ca` (key `ca.pem`) in the Pivotal namespace.
- The root certificates, intermediate certificates and (offline roots) root CRLs saved somewhere
  durable.

## Prerequisites

### Mandatory

- [1. Prerequisites](./1-prerequisites.md) passed, without the AWS rows, and the worksheet filled in.
- A workstation with the `vault` CLI, `openssl` and `kubectl` pointed at the target cluster, with
  `VAULT_ADDR` set to the Vault server.
- A short-lived Vault token for the custodian, with the rights in
  [Step 2](#step-2-get-a-vault-token-for-the-ceremony).
- The Pivotal callback host (web-inbound's public host), for example `web-inbound.example.com`. The
  ceremony writes it into two Vault roles.
- **Offline roots only:**
  - An air-gapped machine with OpenSSL 3 that has never been, and will not be, connected to a network.
  - Two encrypted removable media for the CA folders, and one transfer medium for CSRs and
    certificates.
  - At least two named key holders, present for the whole ceremony.
  - A ceremony record, signed by everyone present.

### Optional

- A rehearsal of the whole page on a test Vault.

> **Run this ceremony once per environment**, on a Vault where `pki_dfsp` and `pki_hub_client` do not
> exist yet. Creating them again later replaces the CA keys, which needs a planned trust transition:
> see [Re-key a Pivotal CA](../../runbooks/common/pivotal-ca-rekey.md).

## Steps

The commands are written for `bash` and `zsh`. In `zsh`, run `setopt interactivecomments` first: the
command blocks contain `#` comments, which interactive `zsh` otherwise passes to the command. Run
every `vault` and `kubectl` command on the workstation, and every `openssl` command marked *offline*
on the air-gapped machine.

### Step 1. Choose where the roots are kept

- **Purpose:** The rest of the page has a branch for each choice.
- **Action:** Choose **in Vault** or **offline** (see [Overview](#overview)) and record the choice in
  the ceremony record. Changing it later means new roots: see
  [Re-key a Pivotal CA](../../runbooks/common/pivotal-ca-rekey.md).
- **Expected Result:** One choice, recorded.

### Step 2. Get a Vault token for the ceremony

- **Purpose:** The ceremony needs to create mounts and roles, and nothing else.
- **Action:** The Vault administrator saves this policy as `pivotal-ceremony.hcl`, writes it, and
  issues a short-lived token (for example one hour) with it. With offline roots, leave out the four
  `_root` lines.
- **Command or Configuration:**

  ```hcl
  path "sys/mounts/pki_dfsp"                        { capabilities = ["create", "update", "delete", "sudo"] }
  path "sys/mounts/pki_hub_client"                  { capabilities = ["create", "update", "delete", "sudo"] }
  path "pki_dfsp/intermediate/*"                    { capabilities = ["create", "update"] }
  path "pki_hub_client/intermediate/*"              { capabilities = ["create", "update"] }
  path "pki_dfsp/roles/*"                           { capabilities = ["create", "update"] }
  path "pki_hub_client/roles/*"                     { capabilities = ["create", "update"] }

  # Roots in Vault only
  path "sys/mounts/pki_dfsp_root"                   { capabilities = ["create", "update", "delete", "sudo"] }
  path "sys/mounts/pki_hub_client_root"             { capabilities = ["create", "update", "delete", "sudo"] }
  path "pki_dfsp_root/root/*"                       { capabilities = ["create", "update"] }
  path "pki_hub_client_root/root/*"                 { capabilities = ["create", "update"] }
  ```

  ```bash
  vault policy write pivotal-ceremony pivotal-ceremony.hcl
  vault token create -policy=pivotal-ceremony -ttl=1h
  ```

  The custodian then enters the token on the workstation, without it reaching shell history:

  ```bash
  read -r -s VAULT_TOKEN; export VAULT_TOKEN
  ```

- **Expected Result:** The custodian holds a token that expires soon after the ceremony.
- **If It Fails:** `permission denied` later on means a line of the policy is missing.

### Step 3. Create the two roots

- **Purpose:** Each CA needs its own root key and self-signed root certificate.
- **Action:** Follow the branch for your choice. Both use one folder per CA, `pki_dfsp` and
  `pki_hub_client`, which later steps read from.

  | CA | Folder and intermediate mount | Root mount (in Vault) | Name (`CN`) |
  |---|---|---|---|
  | DFSP CA | `pki_dfsp` | `pki_dfsp_root` | `Pivotal DFSP-Facing CA` |
  | Pivotal Hub-client CA | `pki_hub_client` | `pki_hub_client_root` | `Pivotal Hub Client CA` |

  `<ORGANIZATION>` is your organization's name. It appears only in the root certificates.

- **Command or Configuration, roots in Vault** (workstation, once per CA):

  ```bash
  MOUNT=pki_dfsp ROOT=pki_dfsp_root CN="Pivotal DFSP-Facing CA"
  # second run: MOUNT=pki_hub_client ROOT=pki_hub_client_root CN="Pivotal Hub Client CA"

  mkdir -p "$MOUNT"
  vault secrets enable -path="$ROOT" -max-lease-ttl=87600h pki
  vault write -field=certificate "$ROOT/root/generate/internal" \
    common_name="$CN Root" organization="<ORGANIZATION>" key_bits=2048 ttl=87600h > "$MOUNT/root.pem"
  ```

- **Command or Configuration, offline roots** (*offline*, once per CA):

  In a folder named after the CA, create `root.cnf`. Set `CN` to `Pivotal DFSP-Facing CA Root` or
  `Pivotal Hub Client CA Root`.

  ```ini
  [ req ]
  distinguished_name = dn
  prompt             = no

  [ dn ]
  O  = <ORGANIZATION>
  CN = Pivotal DFSP-Facing CA Root

  [ v3_root ]
  basicConstraints     = critical, CA:true
  keyUsage             = critical, keyCertSign, cRLSign
  subjectKeyIdentifier = hash

  [ v3_intermediate ]
  basicConstraints       = critical, CA:true, pathlen:0
  keyUsage               = critical, keyCertSign, cRLSign
  subjectKeyIdentifier   = hash
  authorityKeyIdentifier = keyid:always

  [ ca ]
  default_ca = root_ca

  [ root_ca ]
  database         = ./index.txt
  crlnumber        = ./crlnumber
  default_md       = sha256
  default_crl_days = 365
  ```

  ```bash
  # Root key, encrypted with a passphrase that openssl asks for
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -aes-256-cbc -out root.key

  # Self-signed root certificate, 10 years
  openssl req -x509 -new -key root.key -sha256 -days 3650 \
    -config root.cnf -extensions v3_root -out root.pem

  # CA database and CRL counter: created once, here, and never reset
  touch index.txt
  echo 01 > crlnumber
  ```

- **Expected Result:** In each CA folder, `root.pem`. Offline, also `root.key`, `index.txt` and
  `crlnumber`. `openssl x509 -in root.pem -noout -subject` shows the root's name.
- **If It Fails:**
  - `path is already in use` (in Vault): the mount exists from a rehearsal. If nothing has been issued
    from it, `vault secrets disable <ROOT>` and run again.
  - `openssl req` cannot read the key: the passphrase was mistyped. Create the key again.

### Step 4. Create each intermediate key in Vault

- **Purpose:** The intermediate keys are created inside Vault and never leave it. Only a CSR comes
  out.
- **Action:** Run once per CA, on the workstation.
- **Command or Configuration:**

  ```bash
  MOUNT=pki_dfsp CN="Pivotal DFSP-Facing CA"
  # second run: MOUNT=pki_hub_client CN="Pivotal Hub Client CA"

  mkdir -p "$MOUNT"
  vault secrets enable -path="$MOUNT" -max-lease-ttl=43800h pki
  vault write -field=csr "$MOUNT/intermediate/generate/internal" \
    common_name="$CN Intermediate" key_bits=2048 > "$MOUNT/inter.csr"
  ```

- **Expected Result:** `pki_dfsp/inter.csr` and `pki_hub_client/inter.csr`. Offline roots: copy both
  to the transfer medium, each into its CA's folder.
- **If It Fails:** `path is already in use`: see Step 3.

### Step 5. Sign each intermediate with its root

- **Purpose:** The root signs the intermediate once, for 5 years, and limits it to one level below
  it.
- **Command or Configuration, roots in Vault** (workstation, once per CA):

  ```bash
  MOUNT=pki_dfsp ROOT=pki_dfsp_root
  # second run: MOUNT=pki_hub_client ROOT=pki_hub_client_root

  vault write -field=certificate "$ROOT/root/sign-intermediate" \
    csr=@"$MOUNT/inter.csr" ttl=43800h max_path_length=0 use_csr_values=true > "$MOUNT/inter.pem"
  ```

- **Command or Configuration, offline roots** (*offline*, in each CA folder):

  ```bash
  # The root signs the intermediate, 5 years
  openssl x509 -req -in inter.csr -CA root.pem -CAkey root.key -sha256 -days 1825 \
    -set_serial 0x$(openssl rand -hex 16) \
    -extfile root.cnf -extensions v3_intermediate -out inter.pem

  # Root CRL, valid for one year. Each run takes the next number from crlnumber.
  openssl ca -config root.cnf -gencrl -keyfile root.key -cert root.pem -out root.crl
  ```

  Copy `inter.pem`, `root.pem` and `root.crl` from both folders to the transfer medium, and from there
  into the matching folders on the workstation. **`root.key` never goes on the transfer medium.**

- **Expected Result:** In each folder on the workstation: `root.pem` and `inter.pem` (and, offline,
  `root.crl`). `openssl verify -CAfile pki_dfsp/root.pem pki_dfsp/inter.pem` prints `OK`.
- **If It Fails:** `openssl verify` fails: the files of the two CAs were mixed up. Check each file's
  subject and issuer with `openssl x509 -noout -subject -issuer`.

### Step 6. Install each intermediate in Vault

- **Command or Configuration:**

  ```bash
  vault write pki_dfsp/intermediate/set-signed       certificate=@pki_dfsp/inter.pem
  vault write pki_hub_client/intermediate/set-signed certificate=@pki_hub_client/inter.pem
  ```

- **Expected Result:** Each command lists one `imported_issuers` entry. Vault may warn that no
  authority information access (AIA) URLs are set; Pivotal does not use them.
- **If It Fails:** `'pem_bundle' and 'certificate' parameters were empty`: the file path is wrong.

### Step 7. Create the Vault roles

- **Purpose:** The same roles the KMS ceremony restores. Pivotal's services sign through them.
- **Command or Configuration:**

  ```bash
  WEB_INBOUND_HOST=<PIVOTAL_CALLBACK_HOST>

  vault write pki_dfsp/roles/dfsp-client \
    allow_any_name=true enforce_hostnames=false key_bits=2048 organization=ThitsaWorks no_store=true \
    client_flag=true server_flag=false max_ttl=8760h ttl=8760h ou=DFSP \
    require_cn=true use_csr_common_name=false use_csr_sans=false

  vault write pki_hub_client/roles/web-inbound-server \
    allowed_domains="$WEB_INBOUND_HOST" allow_any_name=false allow_bare_domains=true allow_subdomains=false \
    enforce_hostnames=true allow_ip_sans=false require_cn=true use_csr_common_name=false use_csr_sans=false \
    key_bits=2048 server_flag=true client_flag=false max_ttl=2160h ttl=2160h \
    ou=Pivotal organization=ThitsaWorks no_store=true

  vault write pki_hub_client/roles/hub-callback-client \
    allowed_domains="$WEB_INBOUND_HOST" allow_any_name=false allow_bare_domains=true allow_subdomains=false \
    enforce_hostnames=true allow_ip_sans=false require_cn=true use_csr_common_name=false use_csr_sans=false \
    key_bits=2048 server_flag=false client_flag=true max_ttl=8760h ttl=8760h \
    organization=Mojaloop key_type=rsa
  ```

- **Expected Result:** `Success! Data written to: ...` three times.
- **If It Fails:** `cannot parse '' as bool`: the arguments were joined into one. Copy the commands as
  written, without moving arguments into a shell variable.

The KMS ceremony also creates a role `pki_hub_client/roles/pivotal-client`. It is not created here:
the setup in this guide does not use it (see [Vault reference](../../reference/vault.md#pki-roles)).

### Step 8. Publish the Pivotal Hub-client CA root

- **Purpose:** trust-manager reads this root from the Secret `pivotal-hub-client-ca` (key `ca.pem`) and
  registers it with MCM.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal create secret generic pivotal-hub-client-ca \
    --from-file=ca.pem=pki_hub_client/root.pem --dry-run=client -o yaml | kubectl apply -f -
  ```

- **Expected Result:** `secret/pivotal-hub-client-ca created` (or `configured`).

### Step 9. Store the root material and clean up

- **Purpose:** Keep what you will need later; remove what you will not.
- **Action, offline roots** (*offline*):
  1. Copy each **whole CA folder** to both encrypted media: `root.key` (already encrypted),
     `root.cnf`, `index.txt`, `crlnumber`, `root.pem`, `inter.pem` and `root.crl`. Without `index.txt`
     and `crlnumber`, later CRLs lose the revocation history and reuse CRL numbers.
  2. Store the two media in two separate safes. The key holders keep the passphrases. No single person
     holds both a medium and its passphrase.
  3. Wipe the air-gapped machine, or lock it away with the media.

  Later use of the roots (yearly CRL, revoking or renewing an intermediate) is in
  [Use the offline CA roots](../../runbooks/vault-kv/offline-ca-root.md).
- **Action, both:**
  1. Copy `root.pem`, `inter.pem` and (offline) `root.crl` from both folders to durable storage, such
     as your change record. They are public.
  2. Revoke the ceremony token and clear it from the shell: `vault token revoke -self; unset VAULT_TOKEN`.
  3. Delete the folders from the workstation.
- **Expected Result:** The public files are stored; the token is revoked; offline, the root material
  is in two safes.

## Verification

Run the certificate checks before Step 9 deletes the folders, or against your saved copies. Run checks
5 and 6 as the Vault administrator: the ceremony token cannot list or read roles.

| # | Check | Command | Pass |
|---|---|---|---|
| 1 | Each intermediate chains to its own root | `openssl verify -CAfile pki_dfsp/root.pem pki_dfsp/inter.pem` and the same for `pki_hub_client` | `OK` twice |
| 2 | The intermediates are CAs limited to one level | `openssl x509 -in pki_dfsp/inter.pem -noout -ext basicConstraints` | `CA:TRUE, pathlen:0` |
| 3 | The two roots use different keys | `openssl x509 -in pki_dfsp/root.pem -pubkey -noout \| openssl pkey -pubin -outform DER \| openssl dgst -sha256`, and the same for `pki_hub_client/root.pem` | Different hashes. (Certificate fingerprints can differ even for one key, so they do not prove this.) |
| 4 | Each CRL is signed by its root (offline roots) | `openssl crl -in pki_dfsp/root.crl -CAfile pki_dfsp/root.pem -noout` | `verify OK` |
| 5 | Vault roles exist | `vault list pki_hub_client/roles` and `vault list pki_dfsp/roles` | `hub-callback-client`, `web-inbound-server`; and `dfsp-client` |
| 6 | The DFSP CA role keeps certificates to one year | `vault read pki_dfsp/roles/dfsp-client` | `ttl 8760h` and `no_store true` |
| 7 | The published root is the right one | `kubectl -n pivotal get secret pivotal-hub-client-ca -o jsonpath='{.data.ca\.pem}' \| base64 -d \| openssl x509 -noout -fingerprint -sha256` | Equals `openssl x509 -noout -fingerprint -sha256 -in pki_hub_client/root.pem` |

**Negative tests:** run the two negative tests in [2. CA ceremony](./2-ca-ceremony.md#verification)
(a DFSP cannot name another participant; the web-inbound role refuses other hosts). They apply
unchanged.

> Vault refuses to sign a certificate within about 30 seconds of an intermediate being installed
> (`notBefore before signer's notBefore`). Wait a minute after Step 6 before the negative tests.

## Troubleshooting

- The failures under each step's "If It Fails".
- [Vault](../../troubleshooting.md#vault)

## Rollback or Recovery

- **During the ceremony, before anything is issued:** disable the mounts created so far
  (`vault secrets disable <MOUNT>`, as the Vault administrator) and start again from Step 3.
- **Roots in Vault:** the root keys cannot be exported from Vault. They are protected by Vault's
  backups ([Backup and recovery](../../runbooks/common/backup-and-recovery.md)). If Vault's storage
  is lost without a backup, the roots are lost with it.
- **Offline roots:** if both media or the passphrases are lost, the roots cannot be used again: no new
  CRL, and no intermediate renewal. Running Pivotal is not affected until an intermediate needs
  replacing, which then needs new roots.
- **Replacing a CA after setup:** follow [Re-key a Pivotal CA](../../runbooks/common/pivotal-ca-rekey.md).

## References

- [2. CA ceremony](./2-ca-ceremony.md), the KMS version of this page
- [Use the offline CA roots](../../runbooks/vault-kv/offline-ca-root.md)
- [Vault unseal](../../runbooks/common/vault-unseal.md)
- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Vault reference](../../reference/vault.md)
- [Kubernetes resources](../../reference/kubernetes-resources.md)
- Next: [3. Vault](./3-vault.md)

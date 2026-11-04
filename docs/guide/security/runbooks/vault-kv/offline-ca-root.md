# Use the Offline CA Roots

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 and later · Profile: vault-kv (offline roots) · Document version 1.0 (draft)

## Overview

With [offline roots](../../setup/vault-kv/2-ca-ceremony-without-kms.md), the two CA root keys are
kept encrypted in safes and are used only on an air-gapped machine. This page covers each later use
of them:

| Task | When |
|---|---|
| [Re-sign the root CRL](#re-sign-the-root-crl) | Once a year, before the current CRL's `nextUpdate` |
| [Revoke an intermediate](#revoke-an-intermediate) | When an intermediate key is exposed |
| [Sign a new intermediate](#sign-a-new-intermediate) | Before an intermediate's 5 years end, or after one is revoked |

Pivotal's services do not read the root CRL, and the setup in this guide configures no CRL checking.
A revocation records the decision and informs any party that checks the CRL. Actually withdrawing
trust in an intermediate means replacing it: see
[Re-key a Pivotal CA](../common/pivotal-ca-rekey.md).

Every use follows the same pattern: restore the CA folder onto the air-gapped machine, do the task,
and save the updated folder back to both media.

## Objective

Use a root key for one task without exposing it, and keep the CA folder's history complete.

## Expected Outcome

- The task's output (a CRL or an intermediate certificate) is produced and copied out.
- Both encrypted media hold the updated CA folder, including `index.txt` and `crlnumber`.

## Prerequisites

### Mandatory

- The air-gapped machine with OpenSSL 3.
- Both encrypted media, from their safes, and the key holders who know the passphrases.
- A transfer medium for files going in or out.
- A ceremony record for this use, signed by everyone present.

### Optional

- For a new intermediate: a rehearsal on a test environment.

## Steps

### Step 1. Restore the CA folder

- **Purpose:** The root key, `root.cnf`, `index.txt` and `crlnumber` must all be present. A CRL made
  without `index.txt` and `crlnumber` loses earlier revocations and reuses a CRL number.
- **Action:** On the air-gapped machine, copy the CA folder (`pki_dfsp` or `pki_hub_client`) from one
  encrypted medium and change into it.
- **Expected Result:** `ls` shows `root.key`, `root.cnf`, `index.txt`, `crlnumber`, `root.pem` and
  `inter.pem`.
- **If It Fails:** If one medium is unreadable, use the other, and write a replacement copy before
  returning both to the safes.

### Step 2. Check the folder is the latest one

- **Command or Configuration:**

  ```bash
  cat crlnumber
  openssl crl -in root.crl -noout -crlnumber -nextupdate
  ```

- **Expected Result:** `crlnumber` is one more than the CRL number in `root.crl`.
- **If It Fails:** The two media hold different versions. Use the one whose `crlnumber` is higher, and
  record the difference.

### Step 3. Do the task

Do one of the three tasks below.

#### Re-sign the root CRL

- **Purpose:** Keep a valid CRL for each root. The CRL is valid for one year.
- **Command or Configuration:**

  ```bash
  openssl ca -config root.cnf -gencrl -keyfile root.key -cert root.pem -out root.crl
  openssl crl -in root.crl -CAfile root.pem -noout -crlnumber -nextupdate
  ```

- **Expected Result:** `verify OK`, a CRL number one higher than before, and `nextUpdate` a year
  from now.
- **If It Fails:** `unable to load CA private key`: the passphrase was mistyped. Run it again.

#### Revoke an intermediate

- **Purpose:** Record that an intermediate must no longer be trusted.
- **Command or Configuration:**

  ```bash
  openssl ca -config root.cnf -revoke inter.pem -keyfile root.key -cert root.pem
  openssl ca -config root.cnf -gencrl -keyfile root.key -cert root.pem -out root.crl
  openssl crl -in root.crl -noout -text | grep -A1 'Serial Number'
  ```

- **Expected Result:** `Database updated`, and the new CRL lists the intermediate's serial number.
- **Next:** Replace the intermediate. Plan it with [Re-key a Pivotal CA](../common/pivotal-ca-rekey.md),
  and sign the new one as in [Sign a new intermediate](#sign-a-new-intermediate).

#### Sign a new intermediate

- **Purpose:** Replace an intermediate that is near the end of its 5 years, or that was revoked. This
  page covers only the offline signing.
- **Action:**
  1. Plan the change with [Re-key a Pivotal CA](../common/pivotal-ca-rekey.md). The plan covers the
     Vault side: creating the new intermediate key and its CSR, installing the signed certificate,
     and switching Vault to it. Importing a signed intermediate into an existing PKI mount does not
     make it the mount's default issuer, so until the plan switches the default, Vault keeps issuing
     certificates under the old intermediate.
  2. Bring the CSR from that plan in on the transfer medium as `inter.csr`.
  3. Sign it:

     ```bash
     openssl x509 -req -in inter.csr -CA root.pem -CAkey root.key -sha256 -days 1825 \
       -set_serial 0x$(openssl rand -hex 16) \
       -extfile root.cnf -extensions v3_intermediate -out inter.pem
     ```

  4. Take `inter.pem` out on the transfer medium, for installation and activation as planned.
- **Expected Result:** `openssl verify -CAfile root.pem inter.pem` prints `OK`.

### Step 4. Copy out the public results

- **Action:** Copy the new `root.crl` and, after signing a new intermediate, `inter.pem` to the transfer medium. **`root.key`
  never goes on the transfer medium.** Store the public files with the ceremony outputs.
- **Expected Result:** The public files are stored outside the air-gapped machine.

### Step 5. Save the folder back to both media

- **Purpose:** Both copies must hold the new `index.txt` and `crlnumber`.
- **Action:** Copy the whole CA folder to both encrypted media, return them to their separate safes,
  and wipe or lock away the air-gapped machine.
- **Expected Result:** Both media hold the same, updated folder.

## Verification

| Check | Command | Pass |
|---|---|---|
| The CRL is signed by its root | `openssl crl -in root.crl -CAfile root.pem -noout` | `verify OK` |
| The CRL number went up | `openssl crl -in root.crl -noout -crlnumber` | Higher than the previous CRL |
| Both media match (after Step 5) | `sha256sum index.txt crlnumber root.crl` (or `shasum -a 256`) on each copy | Identical |

## Troubleshooting

- The failures under each step's "If It Fails".
- [Vault](../../troubleshooting.md#vault), for the Vault side of a new intermediate.

## Rollback or Recovery

- A CRL cannot be withdrawn once published. To undo a revocation by mistake, the revoked intermediate
  still has to be replaced (see [Sign a new intermediate](#sign-a-new-intermediate)).
- If both media or the passphrases are lost, the roots can no longer be used. Running Pivotal is not
  affected until an intermediate needs replacing, which then needs new roots and a new ceremony.

## References

- [2. CA ceremony without AWS KMS](../../setup/vault-kv/2-ca-ceremony-without-kms.md)
- [Re-key a Pivotal CA](../common/pivotal-ca-rekey.md)
- [Certificates and keys](../../concepts/certificates-and-keys.md)

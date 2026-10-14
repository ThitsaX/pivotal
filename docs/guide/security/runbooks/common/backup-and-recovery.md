# Backup and Recovery

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: both · Document version 1.0 (draft)

## Overview

Pivotal's mTLS and JWS material is spread across Vault, Pivotal's database, Kubernetes Secrets, the
key service of your profile (AWS KMS or AWS CloudHSM) and MCM. Some of it is re-created automatically
if lost. Some of it cannot be re-created at all. This page lists what to back up, and how to recover
each item.

Pivotal does not back up anything itself. Use the backup method of each platform: Vault, your MySQL
service, AWS KMS or AWS CloudHSM.

## Objective

Make sure that every item that cannot be re-created is backed up, and know the recovery for each item.

## Expected Outcome

- Vault, Pivotal's database and, for `pkcs11`, the CloudHSM cluster are backed up on a schedule.
- A copy of the public CA certificates is kept outside the cluster.
- You can recover each item in the tables below.

## Prerequisites

### Mandatory

- Administrator access to Vault, to Pivotal's MySQL database and to the AWS account that holds the
  key service.
- `kubectl` access to the Pivotal namespace and the gateway namespaces.

### Optional

- A test environment to rehearse a restore.

## Steps

### Step 1. Back up the items that cannot be re-created

- **Purpose:** Losing any of these breaks a connection until it is restored, and some losses cannot be
  repaired.
- **Action:** Include each item in a scheduled backup.

  | Item | Where | Contains | If lost and not backed up |
  |---|---|---|---|
  | Vault storage | Vault | Both intermediate CA keys; Vault policies and roles. `vault-kv`: every tenant's Hub JWS signing private key. `pkcs11`: each tenant's key reference and crypto-user credential. | Intermediates: a full re-key ([Pivotal CA re-key](pivotal-ca-rekey.md)). JWS keys or key references: tenants cannot sign, and no supported command replaces a key ([Known limitations](../../known-limitations.md#no-jws-signing-key-rotation)). |
  | Pivotal database | MySQL | DFSP access public keys; tenant and peer JWS public keys and signing/verify settings; the records of every issued DFSP client certificate | Lost certificate records: every DFSP certificate is refused as `not recognised`, and every DFSP needs a new one. Lost JWS public keys: tenants stop signing and senders cannot be verified. **Do not onboard the DFSP again:** under `vault-kv` that also overwrites the tenant's private key in Vault with a new one that MCM does not hold. Restoring the database is the only supported recovery. |
  | CA root keys, `vault-kv` | AWS KMS | The private keys of both roots | Cannot be exported or backed up. Protect the KMS keys against deletion. Lost: a full re-key with new roots. |
  | CA root keys and tenant JWS keys, `pkcs11` | AWS CloudHSM | The private keys of both roots and every tenant's Hub JWS signing key | Keys cannot be exported, but they are included in CloudHSM cluster backups. Keep those backups. Lost without a backup: a full re-key, and tenants cannot sign. |

- **Expected Result:** Each item has a backup schedule and a tested restore.

### Step 2. Keep a copy of the public CA certificates

- **Purpose:** These are public, but some trust anchors are created by hand from them.
- **Action:** Store, outside the cluster, the root certificates from the CA ceremony output, and the
  contents of the Pivotal callback gateway's `-cacert` Secret.
- **Expected Result:** You can re-create `pivotal-hub-client-ca` and the `-cacert` Secret without
  repeating the ceremony.

### Step 3. Recover an item

- **Action:** Find the lost item and follow its recovery.

  | Lost item | Recovery |
  |---|---|
  | Hub client certificate Secret | Restart trust-manager. It enrolls a new certificate when none exists. See [Hub CA re-root](hub-ca-reroot.md), Steps 3–5. |
  | Hub CA bundle (`hub-ca-bundle`) | Restart trust-manager. It reads the Hub CA from MCM and re-creates the Secret. |
  | DFSP-facing gateway trust anchor Secret | Create the Secret again, by hand, in the gateway's namespace. trust-manager then fills it from Vault within an hour, or at once after a restart. It does not create the Secret itself. |
  | Pivotal callback gateway `-cacert` Secret | Re-create it from your copy (Step 2). Nothing re-creates it automatically. |
  | `pivotal-hub-client-ca` Secret | Re-create it from your copy of the root certificate. trust-manager needs it to register Pivotal's CA in MCM. |
  | web-inbound server certificate Secret | cert-manager issues a new one on its own. |
  | Vault | Restore Vault from its backup. Restart web-outbound, web-pivotal, trust-manager and the connectors so they log in again and re-read their keys. |
  | Pivotal database | Restore the database from its backup. Certificates issued after the backup are refused; re-issue them. |
  | CloudHSM cluster (`pkcs11`) | Restore the cluster from its backup, using the AWS CloudHSM procedure. Then restart the services that sign. |

- **Expected Result:** The item is back and the related service logs no errors.
- **If It Fails:** See [Troubleshooting](../../troubleshooting.md#find-the-failing-leg).

## Verification

- **Positive:** After any recovery, run the [End-to-end check](../../setup/common/end-to-end-check.md).
- **Negative:** Rehearse a restore on a test environment at least once a year, and confirm that a
  transfer completes afterwards.

## Troubleshooting

- [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm)
- [Vault](../../troubleshooting.md#vault)
- [HSM](../../troubleshooting.md#hsm)
- **A Java connector does not sign after a Vault restore.** It reads its key only at startup. Restart
  it.

## Rollback or Recovery

Not applicable. This page is the recovery procedure.

## References

- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Kubernetes resources](../../reference/kubernetes-resources.md)
- [Vault reference](../../reference/vault.md)
- [Known limitations](../../known-limitations.md)

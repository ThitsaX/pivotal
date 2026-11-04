# Security: mTLS and JWS

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: both · Document version 1.0 (draft)

## What this section covers

How to set up and operate the two protections Pivotal applies to the messages it carries:

- **Mutual TLS (mTLS):** both ends of a connection prove who they are with a certificate.
- **JWS message signing:** each message carries a signature that proves who sent it and that it was
  not changed.

Both are covered on both sides of Pivotal:

| Side | Connection |
|---|---|
| DFSP-facing | A DFSP's system calling Pivotal |
| Hub-facing | Pivotal calling the Mojaloop Hub, and the Hub calling Pivotal back |

Both key profiles are covered: `vault-kv` (KMS-backed) and `pkcs11` (HSM-backed).

## Which path to follow

1. Skim the [Glossary](reference/glossary.md): it defines every name used here (tenant, peer,
   keyRef, `-cacert` and so on).
2. Read the concepts, in order:
   1. [Overview](concepts/overview.md): the four connections and the components.
   2. [trust-manager](concepts/trust-manager.md): the service that keeps certificates and keys in step with the Hub.
   3. [Certificates and keys](concepts/certificates-and-keys.md): every certificate and key, who holds it, how it renews.
   4. [Security model](concepts/security-model.md): who signs, who verifies, what each control stops.
   5. [Choosing a profile](concepts/choosing-a-profile.md): `vault-kv` or `pkcs11`.
3. Set up: [setup/index.md](setup/index.md). Follow the path for your profile from start to finish.
4. Operate: use the runbooks below when needed.

## Pages

### Setup

| Page | Use it to |
|---|---|
| [setup/index.md](setup/index.md) | Choose your profile's setup path |
| [Hub operator items and setup worksheet](setup/common/hub-operator-and-worksheet.md) | Agree the Hub side and collect every shared value (both profiles) |
| [Prepare the HSM admin pod](setup/pkcs11/hsm-admin-pod.md) | Deploy the `hsm-tools` pod, and start and end a custodian session (`pkcs11`) |

### Runbooks

| Page | Profile | Use it to |
|---|---|---|
| [Onboard a DFSP](runbooks/vault-kv/onboard-dfsp.md) | `vault-kv` | Add a new DFSP |
| [Onboard a DFSP](runbooks/pkcs11/onboard-dfsp.md) | `pkcs11` | Provision a new DFSP's key in the HSM, then add the DFSP |
| [Revoke a DFSP certificate](runbooks/common/revoke-dfsp-certificate.md) | both | Stop a DFSP client certificate from being accepted |
| [Check certificate renewals](runbooks/common/check-certificate-renewals.md) | both | Confirm automatic renewals are working |
| [Re-key Pivotal's CAs](runbooks/common/pivotal-ca-rekey.md) | both | Replace a Pivotal CA |
| [Hub CA re-root](runbooks/common/hub-ca-reroot.md) | both | Follow the Hub operator replacing the Hub CA |
| [Backup and recovery](runbooks/common/backup-and-recovery.md) | both | Know what to back up and how to recover |

### Reference

| Page | Contents |
|---|---|
| [Glossary](reference/glossary.md) | Every name used in this section |
| [Environment variables](reference/environment-variables.md) | Settings for each service |
| [Helm values](reference/helm-values.md) | Chart values that affect mTLS and JWS |
| [Vault](reference/vault.md) | Mounts, roles, paths and policies |
| [Kubernetes resources](reference/kubernetes-resources.md) | Secrets, Certificates, issuers and gateways |
| [MCM endpoints](reference/mcm-endpoints.md) | Calls Pivotal makes to MCM |
| [Scheduled jobs](reference/scheduled-jobs.md) | trust-manager's background jobs |
| [DFSP request signing](reference/dfsp-request-signing.md) | How a DFSP signs its requests to Pivotal; give it to DFSP developers |

### When something goes wrong

| Page | Contents |
|---|---|
| [Troubleshooting](troubleshooting.md) | Symptoms, causes and fixes, by connection |
| [Known limitations](known-limitations.md) | What this version does not do, and the workarounds |

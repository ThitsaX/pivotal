# Choosing a Profile

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: both · Document version 1.0 (draft)

## Summary

A key profile decides where Pivotal keeps two things: the root CA keys, and each tenant's Hub JWS
signing key. Pivotal supports two profiles: `vault-kv` (KMS-backed) and `pkcs11` (HSM-backed).
Everything else (certificates, gateways, MCM, trust-manager) is the same in both. Choose before you
start: changing profile later means repeating the CA ceremony and replacing every tenant's Hub JWS
signing key.

## What is the same in both profiles

- The four legs, the gateways and every certificate. No mTLS private key is kept in KMS or the HSM
  in either profile.
- The intermediate CAs, which are kept in Vault.
- The DFSP access keys, which DFSPs keep themselves.
- trust-manager, MCM registration and certificate renewal.
- web-inbound, which only verifies and holds no signing key.

## What changes

| | `vault-kv` (KMS-backed) | `pkcs11` (HSM-backed) |
|---|---|---|
| Root CA keys | AWS KMS | AWS CloudHSM |
| When KMS or the HSM is used | KMS: only during the CA ceremony. No service calls KMS. | The HSM: during the ceremony, and for every signature at run time |
| Hub JWS private keys | Vault KV, one path per tenant | CloudHSM; cannot be exported. Vault holds each tenant's keyRef and crypto-user login, and web-outbound's crypto-user login. |
| Who creates a tenant's Hub JWS key | web-pivotal, when the DFSP is onboarded in the portal | A custodian, before the DFSP is onboarded (next release; see the note below) |
| How web-outbound signs | In memory, with the key read from Vault | Through PKCS#11, as its own crypto user, using keys shared with it |
| How the connector signs | In memory, with the key read from Vault | Through the CloudHSM JCE provider, as the tenant's crypto user. The connector image must be built for CloudHSM. |
| `KEY_PROVIDER` | `vault-kv` | `pkcs11` |
| Extra people | Ceremony key holders | Custodians holding Crypto Officer credentials, for the ceremony and for every onboarding |
| Extra infrastructure | An AWS account with KMS | An AWS CloudHSM cluster with at least two HSMs, reachable from the Kubernetes cluster |
| Throughput | Signing is limited by CPU | Signing is limited by the HSM; measure it and size replicas to match |

> **`pkcs11` in this release:** you can set up the HSM, the CA ceremony, Vault and the signing
> services. Onboarding a DFSP is not yet available, and web-pivotal does not run with
> `KEY_PROVIDER=pkcs11`. Both arrive in the next release. See
> [Known limitations](../known-limitations.md#pkcs11-dfsp-onboarding-is-not-available-yet).

## Prerequisites by profile

| Prerequisite | `vault-kv` | `pkcs11` |
|---|---|---|
| Kubernetes, Helm, Istio, cert-manager | Yes | Yes |
| HashiCorp Vault with Kubernetes auth | Yes | Yes |
| Access to the Hub's MCM | Yes | Yes |
| AWS KMS (asymmetric signing keys) | Yes | No |
| AWS CloudHSM cluster, at least two HSMs | No | Yes |
| CloudHSM client software and the cluster's CA certificate | No | Yes |
| Connector image built for CloudHSM | No | Yes |
| Custodians with Crypto Officer credentials | No | Yes |

Your profile's prerequisites page gives the full list.

## How to decide

Choose **`pkcs11`** if any of these is true:

- A regulator or policy requires signing keys to be held in hardware that cannot export them.
- You do not want anyone with Vault access to be able to copy a tenant's signing key.

Choose **`vault-kv`** if:

- Keeping signing keys in Vault, protected by Vault policies, meets your requirements.
- You want fewer moving parts: no HSM cluster, and no custodian involvement when onboarding a DFSP.

Do not use `database`. It keeps Hub JWS private keys in Pivotal's database and exists only for older
deployments.

## What this means for you

- Set `KEY_PROVIDER` explicitly on web-outbound, web-pivotal and every connector. If it is not set,
  Pivotal's Node services fall back to `database`. (`pkcs11`: see your deploy page for web-pivotal
  in this release.)
- Follow only your profile's setup path: [setup/index.md](../setup/index.md).

## References

- [Certificates and keys](certificates-and-keys.md)
- [Security model](security-model.md)
- [Environment variables](../reference/environment-variables.md)

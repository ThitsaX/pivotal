# Setup: HSM-Backed Profile (`pkcs11`)

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: pkcs11 · Document version 1.0 (draft)

## Overview

This is the complete setup sequence for the HSM-backed profile. In this profile:

- the two root CA keys are generated and kept inside AWS CloudHSM;
- every tenant's Hub JWS signing key is generated and kept inside AWS CloudHSM;
- Vault holds only crypto-user credentials and key references (keyRef), never a private key.

Follow the pages below in order, from start to finish. Do not use pages from the `vault-kv` folder.

## The sequence

| # | Page | What it leaves you with | Done by |
|---|---|---|---|
| 1 | [Prerequisites](1-prerequisites.md) | Everything to collect and prepare before you start, including the shared [Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md) | Platform engineer |
| 2 | [Prepare the CloudHSM cluster](2-hsm.md) | An activated cluster with two HSMs, and the `cu_web_outbound` crypto user. Midway it sends you to [Prepare the HSM admin pod](hsm-admin-pod.md), the pod used for every CloudHSM task from then on | AWS administrator, then custodians |
| 3 | [Run the CA ceremony](3-ca-ceremony.md) | Both root CAs in CloudHSM, both intermediate CAs in Vault, all Vault PKI roles | Two custodians, witnessed |
| 4 | [Configure Vault](4-vault.md) | The KV mount, policies and Kubernetes auth roles for every workload | Vault administrator |
| 5 | [Deploy Pivotal](5-deploy-pivotal.md) | Pivotal running with `KEY_PROVIDER=pkcs11`, and the profile check passed | Platform engineer |
| 6 | [Enable the DFSP-facing side](../common/enable-dfsp-facing.md) | Leg 1: DFSP client certificates and DFSP JWS checked | Platform engineer |
| 7 | [Enable the Hub-facing side: outbound](../common/enable-hub-facing-outbound.md) | Legs 2 and 3: Hub client certificate and Hub JWS signing | Platform engineer |
| 8 | [Enable the Hub-facing side: inbound](../common/enable-hub-facing-inbound.md) | Leg 4: callback mTLS and JWS verification | Platform engineer |
| 9 | [End-to-end check](../common/end-to-end-check.md) | One transfer proven on every leg | Platform engineer |

> **In this release, steps 6 to 9 cannot be finished in this profile.** They need onboarded DFSPs,
> and `pkcs11` DFSP onboarding arrives with the next release. Complete steps 1 to 5, and the mTLS
> parts of steps 6 to 8. Do not onboard DFSPs through the portal: it would store their private keys
> in plaintext in the database. See
> [Known limitations](../../known-limitations.md#pkcs11-dfsp-onboarding-is-not-available-yet).

## What is different from the `vault-kv` profile

| | `pkcs11` (this path) | `vault-kv` |
|---|---|---|
| Root CA keys | Generated in CloudHSM, non-extractable | AWS KMS |
| Hub JWS private keys | Generated in CloudHSM, owned by the tenant's crypto user | Vault KV |
| What Vault holds for signing | A crypto-user credential and a keyRef | The private key |
| Extra infrastructure | CloudHSM cluster, HSM admin pod, CloudHSM client in the images | None |
| People | Custodians who hold Crypto Officer credentials | KMS key administrators |

Everything on the four `common/` pages is the same in both profiles. See
[Choosing a profile](../../concepts/choosing-a-profile.md).

## References

- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Glossary](../../reference/glossary.md)
- [Environment variables](../../reference/environment-variables.md)
- [Vault reference](../../reference/vault.md)

# Setup: HSM-Backed Profile (`pkcs11`)

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: pkcs11 · Document version 1.0 (draft)

## Overview

This is the complete setup sequence for the HSM-backed profile. In this profile:

- the two root CA keys are generated and kept inside AWS CloudHSM;
- every tenant's Hub JWS signing key is generated and kept inside AWS CloudHSM, by a custodian,
  before the DFSP is onboarded;
- Vault holds only crypto-user credentials, key references (keyRef) and public keys, never a private
  key.

Follow the pages below in order, from start to finish. Do not use pages from the `vault-kv` folder.

## The sequence

| # | Page | What it leaves you with | Done by |
|---|---|---|---|
| 1 | [Prerequisites](1-prerequisites.md) | Everything to collect and prepare before you start, including the shared [Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md) | Platform engineer |
| 2 | [Prepare the CloudHSM cluster](2-hsm.md) | An activated cluster with two HSMs, and the `cu_web_outbound` crypto user. Midway it sends you to [Prepare the HSM admin pod](hsm-admin-pod.md), the pod used for every CloudHSM task from then on | AWS administrator, then custodians and a Vault administrator |
| 3 | [Run the CA ceremony](3-ca-ceremony.md) | Both root CAs in CloudHSM, both intermediate CAs in Vault, all Vault PKI roles | Two custodians, witnessed |
| 4 | [Configure Vault](4-vault.md) | The KV mount, policies and Kubernetes auth roles for every workload | Vault administrator |
| 5 | [Deploy Pivotal](5-deploy-pivotal.md) | Pivotal running with `KEY_PROVIDER=pkcs11`, and the profile check passed | Platform engineer |
| 6 | **Onboard test DFSPs**: [Onboard a DFSP (pkcs11)](../../runbooks/pkcs11/onboard-dfsp.md), once for each of two test DFSPs | Two DFSPs with HSM keys and connectors, which pages 7 to 10 test with (their certificates come from page 7). Follow the runbook's *during setup* notes. | Custodian, then platform engineer |
| 7 | [Enable the DFSP-facing side](../common/enable-dfsp-facing.md) | Leg 1: DFSP client certificates and DFSP JWS checked | Platform engineer |
| 8 | [Enable the Hub-facing side: outbound](../common/enable-hub-facing-outbound.md) | Legs 2 and 3: Hub client certificate and Hub JWS signing | Platform engineer |
| 9 | [Enable the Hub-facing side: inbound](../common/enable-hub-facing-inbound.md) | Leg 4: callback mTLS and JWS verification | Platform engineer |
| 10 | [End-to-end check](../common/end-to-end-check.md) | One transfer proven on every leg | Platform engineer |

After setup, onboard every further DFSP with the same runbook.

## What is different from the `vault-kv` profile

| | `pkcs11` (this path) | `vault-kv` |
|---|---|---|
| Root CA keys | Generated in CloudHSM, non-extractable | AWS KMS |
| Hub JWS private keys | Generated in CloudHSM, owned by the tenant's crypto user | Vault KV |
| What Vault holds for signing | A crypto-user credential, a keyRef and the public key | The private key |
| Who creates a DFSP's key | A custodian, with `provision-hsm-tenant.sh`, before onboarding | web-pivotal, at onboarding |
| Extra infrastructure | CloudHSM cluster, HSM admin pod, CloudHSM client in the images | None |
| People | Custodians who hold Crypto Officer credentials | KMS key administrators |

Everything on the four `common/` pages is the same in both profiles. See
[Choosing a profile](../../concepts/choosing-a-profile.md).

## References

- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Glossary](../../reference/glossary.md)
- [Environment variables](../../reference/environment-variables.md)
- [Vault reference](../../reference/vault.md)

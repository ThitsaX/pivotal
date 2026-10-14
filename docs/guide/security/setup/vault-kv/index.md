# Set Up mTLS and JWS: vault-kv Profile

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: vault-kv · Document version 1.0 (draft)

## Overview

This is the complete setup sequence for the `vault-kv` (KMS-backed) key profile. Follow the pages in
order, from top to bottom. Each page ends with a verification section. Do not start a page until the
previous page's verification passes.

In this profile:

- the two CA root keys are created in AWS KMS and never leave it;
- the intermediate CAs live in Vault PKI;
- each DFSP's Hub JWS signing key is stored in Vault KV, and Pivotal signs with it in software.

If you need signing keys held inside a hardware security module, use the
[`pkcs11` setup](../pkcs11/index.md) instead. See
[Choosing a profile](../../concepts/choosing-a-profile.md).

## Sequence

| # | Page | What you do | Owner |
|---|---|---|---|
| 1 | [Prerequisites](./1-prerequisites.md) | Check infrastructure, tools, access and information | Platform engineer |
| 2 | [CA ceremony](./2-ca-ceremony.md) | Create the two CA roots in AWS KMS and the intermediates in Vault | AWS administrator, custodian |
| 3 | [Vault](./3-vault.md) | Create the KV mount, policies and Kubernetes auth roles | Vault administrator |
| 4 | [Deploy Pivotal](./4-deploy-pivotal.md) | Install the Helm chart with the `vault-kv` settings and run the profile check | Platform engineer |
| 5 | **Onboard test DFSPs**: [Onboard a DFSP (vault-kv)](../../runbooks/vault-kv/onboard-dfsp.md), once for each of two test DFSPs | Two DFSPs with keys and connectors, which pages 6 to 9 test with (their certificates come from page 6). Follow the runbook's *during setup* notes. | Platform engineer |
| 6 | [Enable DFSP-facing mTLS and JWS](../common/enable-dfsp-facing.md) | Leg 1 | Platform engineer, Hub operator |
| 7 | [Enable Hub-facing outbound mTLS and JWS](../common/enable-hub-facing-outbound.md) | Legs 2 and 3 | Platform engineer, Hub operator |
| 8 | [Enable Hub-facing inbound mTLS and JWS](../common/enable-hub-facing-inbound.md) | Leg 4 | Platform engineer, Hub operator |
| 9 | [End-to-end check](../common/end-to-end-check.md) | One transfer, every leg checked, sign-off | Platform engineer |

Pages 6 to 9, and [Hub operator items and setup worksheet](../common/hub-operator-and-worksheet.md)
(used by page 1), are shared with the `pkcs11` profile. They contain no profile-specific steps.

To add a DFSP after setup, use the same runbook: [Onboard a DFSP (vault-kv)](../../runbooks/vault-kv/onboard-dfsp.md).

## Before you start

- Read [Overview](../../concepts/overview.md) and [Certificates and keys](../../concepts/certificates-and-keys.md).
- Book time with the Hub operator. Pages 4, 7 and 8 need items from the Hub side.
- Schedule the CA ceremony (page 2). It needs an AWS administrator to create the root keys, a
  custodian to run the ceremony, and a dedicated ceremony host.

## References

- [Environment variables](../../reference/environment-variables.md)
- [Helm values](../../reference/helm-values.md)
- [Vault](../../reference/vault.md)
- [Kubernetes resources](../../reference/kubernetes-resources.md)
- [Troubleshooting](../../troubleshooting.md)

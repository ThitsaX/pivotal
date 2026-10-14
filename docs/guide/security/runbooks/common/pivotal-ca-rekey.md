# Pivotal CA Re-key

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: both · Document version 1.0 (draft)

> **Not a self-service procedure in this version.** A complete, tested cutover for a Pivotal CA
> re-key is not provided. This page explains what a re-key changes, which parts Pivotal handles on its
> own and which need manual work, so that you can plan one with Pivotal support. Do not repeat the CA
> ceremony on a live deployment without that plan.

## Overview

Pivotal has two certificate authorities, each with a root and an intermediate:

- the **DFSP CA** (`pki_dfsp`), which issues DFSP client certificates;
- the **Pivotal Hub-client CA** (`pki_hub_client`), which issues the web-inbound server certificate
  and the Hub callback certificate.

A re-key replaces a CA's keys. In Pivotal, that means running the CA ceremony again. The ceremony
disables and re-creates **both** PKI mounts, so both intermediates get new keys, and every certificate
they issued must be replaced.

## Objective

Understand the effect of a re-key on each connection and prepare the information needed to plan it.

## Expected Outcome

You have a list of every certificate and trust anchor that the re-key affects, who updates each one,
and the current expiry dates of both CAs.

## Prerequisites

### Mandatory

- Vault CLI access with read access to the two PKI mounts.
- `kubectl` access to the Pivotal namespace and the gateway namespaces.
- Your profile's CA ceremony page: [vault-kv](../../setup/vault-kv/2-ca-ceremony.md) or
  [pkcs11](../../setup/pkcs11/3-ca-ceremony.md).

### Optional

- A test environment where the re-key can be rehearsed end to end.

## Steps

### Step 1. Record the current CA expiry dates

- **Purpose:** The intermediates last 5 years and the roots 10 years. If neither is near expiry and no
  key is exposed, a re-key is not needed.
- **Command or Configuration:**

  ```bash
  vault read -field=certificate pki_dfsp/cert/ca       | openssl x509 -noout -subject -enddate
  vault read -field=certificate pki_hub_client/cert/ca | openssl x509 -noout -subject -enddate
  ```

- **Expected Result:** The subject and expiry date of each intermediate.

### Step 2. Review what the re-key affects

- **Purpose:** Each item below either follows the new CA on its own or must be changed by hand.
- **Action:** Read the table and note the manual items.

  | Item | After the re-key | Who updates it |
  |---|---|---|
  | DFSP-facing gateway trust anchor | Rewritten with the new DFSP CA within an hour, or at once after a trust-manager restart | trust-manager, automatically |
  | Every DFSP client certificate | No longer chains to the trusted CA. **Every DFSP must send a new CSR and receive a new certificate.** | Operator and every DFSP |
  | Pivotal CA registered in MCM (under each tenant and under Pivotal's own DFSP ID) | Re-registered with the new root and intermediate within an hour, once `pivotal-hub-client-ca` holds the new root | trust-manager, automatically |
  | `pivotal-hub-client-ca` Secret (the root that trust-manager registers) | Must hold the new root | `vault-kv`: the ceremony script writes it. `pkcs11`: the operator, with the commands the ceremony prints (as in your profile's CA ceremony page) |
  | Hub egress trust of Pivotal's CA | Changes only when the Hub callback certificate is next published to the Hub | Manual. No supported trigger in this version. |
  | Hub callback certificate | Still signed by the old intermediate. Renewed under the new CA only when it has less than 30 days left. | Manual. No supported trigger in this version. |
  | Pivotal callback gateway trust anchor (`-cacert` Secret) | Holds the old CA. Must hold the CA that signs the Hub callback certificate. | Manual. It is created by hand. |
  | web-inbound server certificate | Renewed under the new CA at its next renewal. The Hub must already trust the new CA by then. | cert-manager; the timing is manual |
  | Hub client certificate, Hub CA bundle, Hub JWS signing keys | Not affected | — |

- **Expected Result:** A list of the manual items for your deployment.

### Step 3. Plan the cutover with Pivotal support

- **Purpose:** The Hub-facing items must change in a fixed order. Done in the wrong order, the Hub's
  callbacks to Pivotal fail, possibly weeks later, at a routine renewal.
- **Action:** Contact Pivotal support with the list from Step 2 and the dates from Step 1. Agree a
  maintenance window with the Hub operator and with every DFSP.

## Verification

Not applicable: this page changes nothing. After a re-key, run the
[End-to-end check](../../setup/common/end-to-end-check.md) and
[Check certificate renewals](check-certificate-renewals.md).

## Troubleshooting

- [trust-manager and MCM](../../troubleshooting.md#trust-manager-and-mcm)
- [Leg 4: Hub-facing inbound](../../troubleshooting.md#leg-4-hub-facing-inbound)
- **Callbacks from the Hub start failing weeks after a re-key.** The Hub callback certificate or the
  web-inbound server certificate was renewed under a CA that the other side does not trust yet. See
  [Known limitations](../../known-limitations.md#a-ca-change-needs-manual-steps).

## Rollback or Recovery

A re-key cannot be rolled back. The ceremony destroys the old intermediates' keys. Rehearse it on a
test environment first.

## References

- [Known limitations](../../known-limitations.md#a-ca-change-needs-manual-steps)
- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Hub CA re-root](hub-ca-reroot.md), for a change of the Hub's CA instead of Pivotal's

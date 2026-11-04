# Revoke a DFSP Certificate

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: both · Document version 1.0 (draft)

## Overview

A DFSP client certificate is the certificate a DFSP presents to the DFSP-facing gateway. Revoke it
when its private key may be exposed, when the DFSP asks, or when the DFSP should no longer use it.
Revocation is recorded in Pivotal's database and is checked on every request, once Pivotal's read
replica has the change (normally within seconds).

## Objective

Make web-outbound refuse every request that presents the revoked certificate.

## Expected Outcome

- The certificate shows the status `revoked` in the portal.
- A request that presents it is refused with `3105` `The client certificate presented has been revoked.`
- If the DFSP should keep transacting, it has a new certificate that is accepted.

## Prerequisites

### Mandatory

- A portal account with the permissions **participant.certificate.view** and
  **participant.certificate.revoke**.
- The DFSP's FSP ID, and the serial number of the certificate to revoke.

### Optional

- A new certificate request (CSR) from the DFSP, if it should keep transacting.
- Access to web-outbound's log, to confirm the refusal.

## Steps

### Step 1. Decide whether the DFSP must be cut off

- **Purpose:** Revocation refuses a certificate when it is presented. It does not block a DFSP that
  presents no certificate while `DFSP_FACING_MTLS_MANDATORY` is `false`.
- **Action:** Check the setting on web-outbound.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal get deploy web-outbound \
    -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="DFSP_FACING_MTLS_MANDATORY")].value}'
  ```

- **Expected Result:** `true`, or empty (which means `false`).
- **If It Fails:** If the value is empty or `false` and the DFSP must be cut off, also replace the
  DFSP's access public key (see Step 4) and plan to turn on mandatory mode. See
  [Known limitations](../../known-limitations.md#revocation-does-not-cut-off-a-dfsp-while-mtls-is-optional).

### Step 2. Find the certificate

- **Action:** In the portal, open **Participant → Certificates**. Enter the FSP ID and load the list.
- **Expected Result:** The list shows each certificate with its serial number, fingerprint, status and
  dates. Status is `active`, `retiring` or `revoked`.

A `retiring` certificate is one that a newer certificate has replaced. It is **still accepted** until it
expires. If the DFSP's key is exposed, revoke the `retiring` certificates too.

### Step 3. Revoke the certificate

- **Action:** Select **Revoke** on the certificate's row. Enter a reason. Type the serial number to
  confirm, then select **Revoke**.
- **Command or Configuration (API alternative):** `POST /participant/certificates/<CERTIFICATE_ID>/revoke`
  on web-pivotal, with the body `{"reason": "<REASON>"}`. The reason is optional.
- **Expected Result:** The row's status changes to `revoked`. The reason is added to the certificate's
  note.
- **If It Fails:**
  - `That certificate has already been revoked.`: nothing to do.
  - `No certificate was found.`: reload the list and check the certificate ID.

Revocation cannot be undone.

### Step 4. Replace the access public key (only if the DFSP's systems are compromised)

- **Purpose:** If the DFSP's access private key may also be exposed, a new certificate alone does not
  protect the DFSP.
- **Action:** Get a new access public key from the DFSP. Agree the time of the change with the DFSP:
  the old key stops working within about five seconds.
- **Command or Configuration:** `PUT /participant/access-key` on web-pivotal, with the body
  `{"name": "<FSP_ID>", "accessPublicKey": "<PEM>"}`. Permission: **participant.access-key.update**.
- **Expected Result:** Requests signed with the new key are accepted.

### Step 5. Issue a new certificate (if the DFSP keeps transacting)

- **Action:** In **Participant → Certificates**, paste the DFSP's new CSR and select **Sign request**.
  Download the certificate and chain and send them to the DFSP.
- **Expected Result:** The new certificate is listed as `active`.
- **If It Fails:** See the issuance step in [Enable the DFSP-facing side](../../setup/common/enable-dfsp-facing.md#step-5-issue-a-client-certificate-to-each-test-dfsp).
  It is the same on both profiles.

## Verification

- **Positive:** The DFSP sends a request with its new certificate. It is accepted.
- **Negative:** A request that presents the revoked certificate is refused with `3105`
  `The client certificate presented has been revoked.` web-outbound logs:

  ```bash
  kubectl -n pivotal logs deploy/web-outbound --since=15m | grep "is revoked"
  ```

  Expected: `Rejected '<FSP_ID>': certificate <FINGERPRINT> is revoked.`

## Troubleshooting

- [Leg 1: DFSP-facing](../../troubleshooting.md#leg-1-dfsp-facing)
- **The revoked certificate is still accepted.** Check you revoked the right serial number, and also
  any `retiring` certificate of the DFSP.
- **The TLS handshake still succeeds with the revoked certificate.** Expected. Pivotal does not publish
  a revocation list, so the gateway accepts the handshake and web-outbound refuses the request.

## Rollback or Recovery

Revocation cannot be undone. To restore the DFSP's access, issue a new certificate (Step 5).

## References

- [Known limitations](../../known-limitations.md)
- [Certificates and keys](../../concepts/certificates-and-keys.md)
- [Enable the DFSP-facing side](../../setup/common/enable-dfsp-facing.md)

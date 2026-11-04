# End-to-End Check

> Applies to: Pivotal v1.4.0 and later, Helm chart 0.3.0 · Profile: both · Document version 1.0 (draft)

## Overview

This page runs one transfer between two DFSPs and checks every leg on the way. It ends with a
sign-off checklist for the whole setup. Run it at the end of setup, after any change to certificates,
keys or gateways, and before you hand an environment over.

## Objective

Prove, with one transfer, that all four legs use mTLS and JWS as configured.

## Expected Outcome

- The transfer completes.
- Each leg shows the evidence listed in [Steps](#steps).
- Every item in the [sign-off checklist](#sign-off-checklist) is ticked.

## Prerequisites

### Mandatory

- [Enable Hub-facing inbound mTLS and JWS](./enable-hub-facing-inbound.md) completed.
- Two onboarded DFSPs, `<DFSP_A>` (payer) and `<DFSP_B>` (payee), each with a client certificate, a
  connector, and a callback endpoint on the Pivotal callback host.
- `<DFSP_A>` can send a correctly signed `POST /secured/sendmoney` with its client certificate. How
  to build the signature: [DFSP request signing](../../reference/dfsp-request-signing.md).
- The Hub operator is available to read the Hub's logs.

### Optional

- None.

## Steps

### Step 1. Run the transfer

- **Purpose:** Produce traffic on every leg.
- **Action:** `<DFSP_A>` sends a transfer to a party at `<DFSP_B>` through the DFSP-facing host, with
  its client certificate and a signed `authorization` header. Note the transfer ID.
- **Expected Result:** The response shows the transfer completed.
- **If It Fails:** Use [Find the failing leg](../../troubleshooting.md#find-the-failing-leg), then
  the step below for that leg.

### Step 2. Leg 1: DFSP to web-outbound

- **Purpose:** Confirm the certificate and the signature were both checked.
- **Action:** Look for rejections from either check during the transfer.
- **Command or Configuration:**

  ```bash
  kubectl -n pivotal logs deploy/web-outbound --since=15m | grep -E "Rejected|certificate belongs to"
  ```

- **Expected Result:** No line for `<DFSP_A>`. (The check logs only rejections.)
- **If It Fails:** [Enable DFSP-facing mTLS and JWS](./enable-dfsp-facing.md#troubleshooting).

### Step 3. Legs 2 and 3: Pivotal to the Hub

- **Purpose:** Confirm messages to the Hub were signed and sent over mTLS.
- **Action:** Ask the Hub operator to find the transfer ID in the Hub's logs and in the Hub API
  gateway's access log.
- **Expected Result:**
  - `POST /quotes` and `POST /transfers` from `<DFSP_A>` carry `fspiop-signature` (leg 2).
  - The `PUT` callbacks from `<DFSP_B>` carry `fspiop-signature` (leg 3).
  - `GET /parties` has no signature. That is correct: it has no body.
  - All requests arrived on the Hub API gateway's mTLS host.
- **If It Fails:** [Enable Hub-facing outbound mTLS and JWS](./enable-hub-facing-outbound.md#troubleshooting).

### Step 4. Leg 4: Hub to web-inbound

- **Purpose:** Confirm callbacks came through the Pivotal callback gateway and passed signature
  checks.
- **Action:** Read the gateway's access log for the callback host.
- **Command or Configuration:**

  ```bash
  kubectl -n <GATEWAY_NAMESPACE> logs -l <GATEWAY_SELECTOR_KEY>=<GATEWAY_SELECTOR_VALUE> --since=15m \
    | grep '<PIVOTAL_CALLBACK_HOST>'
  ```

- **Expected Result:** The Hub's callbacks for the transfer, each answered with a 2xx status.
- **If It Fails:** A 401 means web-inbound rejected a signature (web-inbound does not log these).
  Lower that sender's verify mode and see
  [Enable Hub-facing inbound mTLS and JWS](./enable-hub-facing-inbound.md#troubleshooting).

### Step 5. Profile check

- **Purpose:** Confirm the signing keys are where your profile puts them.
- **Action:** Run the profile check at the end of your profile's deploy page:
  [vault-kv](../vault-kv/4-deploy-pivotal.md#verification), or for pkcs11 the per-DFSP check in
  [Onboard a DFSP (pkcs11)](../../runbooks/pkcs11/onboard-dfsp.md#step-5-check-that-payments-work).
- **Expected Result:** It passes for `<DFSP_A>` and `<DFSP_B>`.

## Verification

### Sign-off checklist

**Environment**

- [ ] The two CA roots are different keys, held in KMS (`vault-kv`) or the HSM (`pkcs11`).
- [ ] Vault roles `dfsp-client`, `web-inbound-server` and `hub-callback-client` exist, and
      `dfsp-client` ignores names in requests.
- [ ] Secret `pivotal-hub-client-ca` holds the Pivotal Hub-client CA root.
- [ ] Each service has its own Vault role; no connector can read another DFSP's key.
- [ ] `KEY_PROVIDER` is set explicitly, to the same profile, on web-outbound, web-pivotal and every
      connector. Unset on web-outbound or web-pivotal means no signing keys.
- [ ] trust-manager is running and its jobs are scheduled.

**Leg 1**

- [ ] The DFSP-facing host has its own credential, and its `-cacert` anchor holds only the DFSP CA
      intermediate (no other text).
- [ ] The gateway sets `x-forwarded-client-cert` with `SANITIZE_SET`; web-outbound's sidecar uses `FORWARD_ONLY`.
- [ ] A DFSP's certificate used with another DFSP's `FSPIOP-Source` is refused.
- [ ] `DFSP_FACING_MTLS_MANDATORY` is `true` and the gateway is `MUTUAL`, or the decision to stay optional is recorded together with the network control that protects the host.

**Legs 2 and 3**

- [ ] web-outbound and every connector present the Hub client certificate and verify the Hub with `hub-ca-bundle`.
- [ ] Every DFSP shows `jwsSignEnabled: true`.
- [ ] The Hub's logs show signed quotes, transfers and callbacks.

**Leg 4**

- [ ] The callback host refuses callers without a certificate, and refuses DFSP certificates.
- [ ] trust-manager has signed and published the Hub callback certificate.
- [ ] Each sender's verify mode is recorded, and every sender that signs everything is on `require`.

**Negative tests run**

- [ ] Impersonation on leg 1 refused.
- [ ] No-certificate connections refused on the Hub API gateway and the callback host.
- [ ] An unsigned request from a `require` sender rejected.

## Troubleshooting

- [Find the failing leg](../../troubleshooting.md#find-the-failing-leg)

## Rollback or Recovery

Not applicable. This page changes nothing.

## References

- [Overview](../../concepts/overview.md)
- [Security model](../../concepts/security-model.md)
- [Check certificate renewals](../../runbooks/common/check-certificate-renewals.md)

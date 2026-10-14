# Known Limitations

> Applies to: Pivotal v1.0.1 – v1.3.0, Helm chart 0.2.0 · Profile: both · Document version 1.0 (draft)

## Summary

This page lists what Pivotal's mTLS and JWS support does **not** do in this version, and what to do
instead. Read it before you plan a production rollout. Each entry states the effect and the
workaround, if one exists.

## No JWS signing key rotation

**Effect:** There is no command, screen or API that replaces a tenant's Hub JWS signing key.

- Onboarding a DFSP again does not replace its key. If the tenant already has a public key on record,
  onboarding leaves it in place.
- trust-manager's hourly job never replaces a key that MCM already holds. If MCM and Pivotal hold
  different keys, trust-manager logs a warning, does not change the tenant's signing setting, and does
  nothing else.
- Writing a new private key into Vault (`vault-kv`) does not rotate the key either. web-outbound reads
  Vault every few seconds, so it starts signing with the new key before the Hub and peers know about
  it, and their verification fails.
- `POST /participant/signing-keys` is a legacy endpoint. It overwrites the public key on record (and
  can store a private key in Pivotal's database) without changing the key that signs under `vault-kv`
  or `pkcs11`. trust-manager then reports that MCM holds a different key. Do not use it with either
  profile. The related `POST /participant/signing-key` returns a newly generated private key in its
  response; do not use it either.

**What to do:** Treat Hub JWS signing keys as long-lived. Protect them with the controls of your
profile. If a key is compromised, contact Pivotal support. Do not edit keys in Vault, the HSM or MCM
by hand.

## No DFSP offboarding

**Effect:** There is no command, screen or API that offboards or deactivates a DFSP. Pivotal does not
delete the DFSP's keys, its Vault entries, or its records in MCM.

**What to do:** To stop a DFSP from transacting through Pivotal:

1. Revoke all its DFSP client certificates. See
   [Revoke a DFSP certificate](runbooks/common/revoke-dfsp-certificate.md).
2. Make sure `DFSP_FACING_MTLS_MANDATORY` is `true`. Without it, revocation does not cut the DFSP
   off (see [Revocation does not cut off a DFSP while mTLS is optional](#revocation-does-not-cut-off-a-dfsp-while-mtls-is-optional)).
3. Ask the Hub operator to deactivate the DFSP on the Hub.

## Revocation does not cut off a DFSP while mTLS is optional

**Effect:** While `DFSP_FACING_MTLS_MANDATORY` is `false` (the default), a DFSP may connect without a
client certificate and is still admitted. A DFSP whose certificate is revoked can simply stop
presenting it. A revoked certificate is refused only when it is presented.

**What to do:** Set `DFSP_FACING_MTLS_MANDATORY=true` once every DFSP has a certificate. Until then,
treat revocation as a way to refuse one certificate, not a way to block a DFSP.

## DFSP certificate revocation is local to Pivotal

**Effect:** Revoking a DFSP client certificate changes its status in Pivotal's database only. Pivotal
does not publish a certificate revocation list (CRL) or answer OCSP requests, and does not revoke the
certificate in Vault. The DFSP-facing gateway still completes the TLS handshake. web-outbound then
rejects the request.

**What to do:** Nothing. web-outbound checks the status on every request, so revocation takes effect
on the next request, once Pivotal's read replica has the change (normally within seconds). A revoked certificate cannot be reinstated. The DFSP must request a new one.

## Hub-facing certificates cannot be revoked

**Effect:** Pivotal has no way to revoke the Hub client certificate, the Hub callback certificate or
the web-inbound server certificate.

**What to do:** If one of these private keys is exposed, replace the certificate. See
[Check certificate renewals](runbooks/common/check-certificate-renewals.md) for how to force the Hub
client certificate and the web-inbound server certificate to be re-issued. Ask the Hub operator
whether the Hub can refuse the old certificate.

The Hub callback certificate is an exception: its private key is held by the Hub (MCM), not by
Pivotal, so an exposure is for the Hub operator to handle. Pivotal cannot re-issue it early; see
[The Hub callback certificate cannot be renewed early](#the-hub-callback-certificate-cannot-be-renewed-early).

## The DFSP access key has no overlap period

**Effect:** Replacing a DFSP's access public key takes effect for every request within about five
seconds. Requests the DFSP signs with its old key fail from that moment.

**What to do:** Agree the exact time of the change with the DFSP.

## A CA change needs manual steps

**Effect:** Routine certificate renewal is automatic. A change of certificate authority is not:

- **Pivotal Hub-client CA re-key.** The Hub keeps trusting the old CA, and the Pivotal callback
  gateway's trust anchor is set by hand. Without a manual cutover, callbacks fail weeks or months
  later, at the next routine renewal.
- **DFSP CA re-key.** Every DFSP client certificate issued under the old CA stops working, and every
  DFSP must request a new one.
- **Hub CA re-root.** trust-manager renews Pivotal's Hub client certificate only near its expiry date,
  not when the Hub's CA changes.

**What to do:** See [Pivotal CA re-key](runbooks/common/pivotal-ca-rekey.md) and
[Hub CA re-root](runbooks/common/hub-ca-reroot.md).

## The Hub callback certificate cannot be renewed early

**Effect:** trust-manager renews the Hub callback certificate only when it has less than 30 days left.
There is no setting or command that makes it renew sooner.

**What to do:** Plan any change that needs a new Hub callback certificate (for example a Pivotal
Hub-client CA re-key) with Pivotal support.

## web-inbound does not log rejected signatures

**Effect:** When web-inbound rejects a message because of its signature, it writes nothing to its log.
The rejection is visible only in the error response sent back to the Hub.

**What to do:** Use verify mode `verify-if-present` before `require`. In that mode, web-inbound logs a
warning the first time it accepts an unsigned message from a sender. Check the Hub's logs for error responses with codes
`3105`, `3101` or `3102`. See [Troubleshooting](troubleshooting.md#leg-4-hub-facing-inbound).

## A missing signing key means unsigned messages, not errors

**Effect (`vault-kv`):** If a tenant has no signing key that the service can read, the message is
still sent, without a signature:

- **web-outbound** (`vault-kv`) logs an error when it cannot read the key from Vault, and sends the
  tenant's requests unsigned.
- **The Java connector** logs a warning (`No JWS signing key at Vault path '…'. Outbound FSPIOP
  callbacks will be sent unsigned.`) and sends its callbacks unsigned.

The receiver then rejects those messages if it requires signatures.

**Effect (`pkcs11`):** web-outbound does not start without its own crypto-user credential. If it
cannot see a tenant's key (the key was not shared with it), that tenant's requests **fail** with
`No private key labelled '<KEY_REF>' on this token. …`. The connector sends unsigned, with a warning,
when no key reference exists for its tenant.

**What to do:** After onboarding and after any change, check the service logs for these lines. See
[Troubleshooting](troubleshooting.md#legs-2-and-3-hub-facing-outbound).

## The Java connector reads its signing key only at startup

**Effect:** The Java connector loads the tenant's signing key once, when it starts. A key added or
changed later is not picked up.

**What to do:** Restart the connector after its tenant's key is first provisioned. Its certificate and
CA files are different: the connector reloads them automatically every 60 seconds.

## The connection from a connector to the DFSP's own system

**Effect:** This guide does not cover the connection from a connector to the DFSP's core system. Its
security is agreed between the DFSP and the operator of the connector.

**What to do:** Secure it according to the DFSP's own requirements.

## DFSP-held signing keys

**Effect:** Pivotal holds the private part of every tenant's Hub JWS signing key, in Vault or in the
HSM. A mode in which the DFSP keeps its own signing key and Pivotal asks it to sign is planned, but is
not available in this version.

**What to do:** Nothing in this version.

## What this means for you

- Decide the rollout of `DFSP_FACING_MTLS_MANDATORY` early. Most DFSP-facing protections depend on it.
- Plan CA changes and key compromise handling with Pivotal support before you need them.
- Monitor the service logs named on this page. Several failures show up only there.

## References

- [Certificates and keys](concepts/certificates-and-keys.md)
- [Troubleshooting](troubleshooting.md)
- [Scheduled jobs](reference/scheduled-jobs.md)

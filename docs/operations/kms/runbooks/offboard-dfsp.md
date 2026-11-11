# Offboard a DFSP — KMS-Backed

Removing a DFSP's ability to transact. Triggered when a participant leaves the scheme.

Order matters: stop them transacting first, then clean up, so there is never a window where the
records say they are gone but their credentials still work.

---

## 1. Revoke their TLS client certificate

Portal → **Participant → Certificates** → revoke.

This takes effect **immediately** — `DfspCertificateGuard` reads the `participant_cert` row on every
request, so there is no cache to wait for and no CRL involved. A certificate revoked and used in the
same second is refused.

Confirm it: a request from that DFSP should now be refused at the binding check.

## 2. Turn off their signing and verification

Set `jws_sign_enabled = 0` for the tenant, and set their verify mode so nothing accepts their
signatures. Use the portal's participant screens rather than editing the database.

## 3. Deactivate the participant

Portal → **Participant** → deactivate, so no new transfers are accepted for them.

## 4. Remove the key material

- Delete the Vault path `pivotal-kv/pivotal/jwskey/<fspId>`.
- Leave `participant_key` in place and **retire the row by status**. It is the record that the tenant
  ever had a signing identity, and deleting it makes past transactions unaccountable.

## 5. Remove the connector, if they had one

Remove its block from the chart, along with its Vault policy and role, and its entry in
`hubClientCertificates.workloads`.

## 6. Tell MCM

The DFSP's registration stays in MCM unless the Hub operator removes it. That is their side, not
yours — raise it with them so the registry does not keep a participant the scheme no longer has.

---

## What not to do

**Do not delete `participant_cert` rows.** Retire them by status. The row is the only record that a
certificate was ever issued, and a purged row does not disable a certificate — it makes it
unaccountable.

**Do not reuse the fspId.** Ids are case-sensitive and appear in the certificate common name, the
Vault path and the database. A reused id inherits retired rows and historical transactions belonging
to someone else.

---

## Related

- [`onboard-dfsp.md`](./onboard-dfsp.md) — what this undoes, step for step
- [`../../hsm/runbooks/offboard-dfsp.md`](../../hsm/runbooks/offboard-dfsp.md) — the same operation
  where the key lives in hardware, which adds destroying the key and its crypto user

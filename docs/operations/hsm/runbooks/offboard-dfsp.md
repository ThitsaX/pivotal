# Offboard a DFSP — HSM-Backed

> **Written for the CloudHSM backend.** Crypto users, ownership and sharing are CloudHSM concepts.
> On the SoftHSM backend a tenant gets its own **token and PIN** instead, mounted only into that
> tenant's connector, and there is no sharing step — see
> [`../setup/1-softhsm-tokens.md`](../setup/1-softhsm-tokens.md). Everything else here is the same.

Removing a DFSP's ability to transact. Triggered when a participant leaves the scheme.

Order matters, and here it matters twice: stop them transacting before cleaning up, and **destroy the
key before removing its owner** — a crypto user cannot be deleted while it owns keys, and a key whose
owner is gone is unaccountable rather than deleted.

---

## 1. Revoke their TLS client certificate

Portal → **Participant → Certificates** → revoke.

Immediate — `DfspCertificateGuard` reads the `participant_cert` row on every request, so there is no
cache to wait for and no CRL involved.

## 2. Turn off their signing and verification

Set `jws_sign_enabled = 0` for the tenant and set their verify mode so nothing accepts their
signatures.

## 3. Deactivate the participant

Portal → **Participant** → deactivate.

## 4. Destroy the key in the HSM

As **that tenant's own crypto user**, because only the owner can delete a key:

```bash
CLOUDHSM_ROLE=crypto-user CLOUDHSM_PIN=cu-DemoDFSP3:<password> \
  cloudhsm-cli key delete --filter attr.label=<the keyRef>
```

> **There is no automated path for this.** Destroying a key in the HSM is a manual step today, so it
> has to be done deliberately as part of offboarding. A key left behind is not neutral — it stays
> usable by anyone holding that crypto user's credential.

Then clear `pivotal-kv/pivotal/keyref/<fspId>`.

## 5. Remove the crypto user

A **Crypto Officer** operation, so a custodian does it — and only after step 4, because the user
cannot be removed while it still owns a key.

```bash
CLOUDHSM_ROLE=admin CLOUDHSM_PIN=admin:<CO password> \
  cloudhsm-cli user delete --username cu-DemoDFSP3 --role crypto-user
```

Then clear `pivotal-kv/pivotal/hsmcred/<fspId>`.

This will show up on the Crypto Officer alarm. That is correct — it should be attributable to a
scheduled offboarding, and an occurrence nobody can account for is exactly what the alarm is for.

## 6. Remove the connector, if they had one

Remove its block from the chart, along with its Vault policy and role, and its entry in
`hubClientCertificates.workloads`.

## 7. Tell MCM

The DFSP's registration stays in MCM unless the Hub operator removes it. Raise it with them.

---

## What not to do

**Do not delete the crypto user before the key.** CloudHSM refuses it while the user owns keys, and
forcing the order the other way round is how a key ends up with no accountable owner.

**Do not delete `participant_key` or `participant_cert` rows.** Retire them by status. They are the
only record that the tenant ever had an identity, and a purged row makes past transactions
unaccountable.

**Do not reuse the fspId.** It appears in the crypto-user name, the certificate common name, the key
label and the Vault paths. A reused id inherits retired rows belonging to someone else.

---

## Related

- [`onboard-dfsp.md`](./onboard-dfsp.md) — what this undoes, step for step
- [`../../kms/runbooks/offboard-dfsp.md`](../../kms/runbooks/offboard-dfsp.md) — the same operation
  where the key is a PEM in Vault, with no crypto user to remove

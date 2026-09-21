# Rotate a Tenant's Signing Key — KMS-Backed

Replacing one DFSP's FSPIOP JWS signing key. Triggered by policy, or by a suspected compromise.

> ## There is no rotation command
>
> Nothing in the portal or the API rotates a signing key. The participant operations available are
> `add-signing-keys`, `update-jws-policy`, `update-access-key`, `enroll-dfsp-certificate` and
> `revoke-dfsp-certificate`.
>
> So rotation today is the manual sequence below. Treat it as a procedure to be done carefully
> rather than a button, and read the ordering rule before starting.

---

## The ordering rule, and why it matters

**Publish the new public key to MCM before anything signs with the new private key.**

Peers verify against what MCM holds. Sign first and every signature is rejected by every peer that
has verification switched on, for as long as MCM is behind. There is no overlap window on a single
key — one key is registered per FSP at a time — so the gap is a hard outage for that tenant, not a
degradation.

That is also why rotation is not free: it is a coordinated change, even though only one tenant is
involved.

## Steps

1. **Generate the new keypair** and write the private half to Vault at
   `pivotal-kv/pivotal/jwskey/<fspId>`, replacing what is there.
2. **Update `participant_key.jws_public_key`** for that tenant to the new public half.
3. **Publish to MCM.** trust-manager's hourly reconcile will do this, but during a deliberate
   rotation you do not want to wait up to an hour with signing broken — confirm it has happened
   before continuing.
4. **Restart the tenant's connector and web-outbound**, or wait for their reload, so the new key is
   read from Vault. Both cache at startup.
5. **Verify** a real transfer completes with `fspiop-signature` present in the switch's logs.

## If you are rotating because of a compromise

Do not treat the old key as usable during the change. The sequence above minimises the outage but
does not eliminate it — accept a short break in that tenant's traffic rather than leaving a
compromised key registered.

Also check what else the compromise reached. A key in this profile lives in process memory, so
anything that could read it could probably read the others on the same pod — web-outbound holds
every tenant's key, which is where the blast radius of that component sits.

## Related

- [`onboard-dfsp.md`](./onboard-dfsp.md) — where the key came from originally
- [`../../hsm/runbooks/rotate-signing-key.md`](../../hsm/runbooks/rotate-signing-key.md) — the same
  operation where the key lives in hardware

# Re-seed Signing Keys After a Vault Restart

**Local development only.** Run whenever the local Vault pod has restarted and tenants have stopped
signing.

**Script:** [`scripts/seed-vault-jwskeys.sh`](./scripts/seed-vault-jwskeys.sh)

---

> ## Do not run this against a shared or deployed environment
>
> It generates a **fresh** keypair for every tenant with `role='self'` and updates the public key in
> MySQL — but it does **not** republish to MCM. Peers verify against what MCM holds, so on any
> environment whose keys have been published this silently breaks signing for every tenant at once.
>
> It also writes the legacy path `secret/pivotal/jwskey/<fspId>`. Deployed environments read from the
> `pivotal-kv` v2 mount, so what it writes is not even where they look.
>
> The script was written before trust-manager existed. **trust-manager now provisions signing keys at
> onboarding and is the only thing that should.**

---

## Why this is needed at all

The local stack runs Vault in dev mode with `storage: inmem`. Every Vault pod restart loses all
secrets — including every tenant's signing key. Nothing recreates them, so signing stops and stays
stopped.

`jws-private-key-source.ts` fails loudly in this state rather than silently signing with nothing, so
the symptom is clear in the logs: a tenant with `jws_sign_enabled` and no key at its Vault path.

## Run it

```bash
cd docs/operations/local/runbooks/scripts
./seed-vault-jwskeys.sh
```

It reads every `role='self'` tenant from `pivotal.participant_key`, generates a fresh RSA-2048 pair
for each, writes the private half to Vault and updates the matching public key in the database. It is
idempotent — re-running simply regenerates.

It finishes by listing what is in Vault, so you can see what it did rather than trust an exit code.

## What it deliberately does not do

**It never copies a key out of `participant.jws_private_key`.** Every value in that column is
plaintext PEM and must be treated as compromised, so migrating one would carry the exposure forward.
It regenerates instead.

**It does not clear that column either.** Retiring those legacy rows is a migration script's job, and
a migration has to be able to find them.

## When you will stop needing it

When the local Vault is given real storage instead of `inmem`, or when local work moves onto a
deployment where trust-manager provisions keys. Until then this is the recovery path, and the reason
it survives.

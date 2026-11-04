# Local Development and CI

The stack on a laptop: k3d, Vault in dev mode, cert-manager and SoftHSM2.

Nothing here runs in a deployed environment. Its value is that it exercises the **same PKCS#11 code
path** the HSM-backed profile uses, so the ceremony and the signing path can be proved without cloud
access.

---

## Rehearse the ceremony

| Document | Contents |
| --- | --- |
| [`setup/ceremony.md`](./setup/ceremony.md) · [`setup/scripts/ceremony-local.sh`](./setup/scripts/ceremony-local.sh) | Both CA trust domains rooted in SoftHSM2, with Vault in Docker. One token per trust domain, root keys marked non-extractable, and a root CRL |
| [`setup/scripts/setup-vault-pki.sh`](./setup/scripts/setup-vault-pki.sh) | Brings both trust domains up in the local Vault and wires cert-manager to them. **Self-signs the roots inside Vault** — that is the one thing a real environment does differently, where the ceremony signs them instead. Idempotent; re-run after a Vault pod restart |

**What this genuinely rehearses:** the PKCS#11 calls, the certificate contents, the Vault side of the
ceremony, and the root CRL. Swapping the module path is most of what separates it from
[`../hsm/setup/2-ca-ceremony.md`](../hsm/setup/2-ca-ceremony.md).

**What it cannot rehearse**, and it is the risky half:

- **No crypto-user model.** SoftHSM has one security-officer PIN and one user PIN per token — no
  per-user key ownership and no sharing. None of the isolation the HSM profile depends on can be
  tested here.
- **Session behaviour** — the login model, how long a session lives, and whether a client recovers
  after an idle disconnect. These vary between devices, and CloudHSM will not match SoftHSM on any
  of them.

Budget an integration pass against a real cluster for both.

---

## Recover after a Vault restart

| Document | Contents |
| --- | --- |
| [`runbooks/reseed-signing-keys.md`](./runbooks/reseed-signing-keys.md) · [`runbooks/scripts/seed-vault-jwskeys.sh`](./runbooks/scripts/seed-vault-jwskeys.sh) | The local Vault runs in dev mode, so a pod restart loses every signing key. This puts them back |

> **That script must never be run against a shared or deployed environment.** It regenerates every
> tenant's key without republishing to MCM, which silently breaks signing for all of them at once.
> The runbook explains why; the script carries the same warning at the top.

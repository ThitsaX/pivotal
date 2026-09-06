# Signing Tenant Provisioning

**Status:** built 2026-09-06/07, not yet deployed. Two corrections to the original design are marked below.

Onboarding a DFSP must produce a working signing tenant with no manual step — no SQL, no key pasted
into a form, no operator ever seeing private key material. This describes how.

The gap it closes is recorded under leg #2 in [`status.md`](./status.md): three faults that together
mean no supported route exists to a `role = self` participant under Vault or HSM key custody.

---

## 1. What must be true after onboarding

| | |
| --- | --- |
| A `participant_key` row exists | `role = self`, public key present, `jws_private_key` NULL |
| The private key exists where the profile expects it | Vault KV, or inside the HSM |
| The public key has reached MCM | so peers can verify what this tenant signs |
| Signing is on | `jws_sign_enabled = 1` |
| No human saw a private key | at any point, in any profile |

The last line is the constraint the rest of the design follows from.

---

## 2. Provisioning is a seam, not a Vault call

Reading a signing key is already abstracted, because custody differs by deployment:

```
abstract JwsPrivateKeySource
   ├── DatabaseJwsPrivateKeySource     legacy, key inline in MySQL
   ├── VaultJwsPrivateKeySource        key at secret/pivotal/jwskey/<fspId>
   └── (pkcs11)                        not yet
```

selected from `KEY_PROVIDER` in `participant/domain/domain.module.ts`.

**Provisioning gets the same shape**, for the same reason. Writing Vault calls into the onboarding
handler would work today and would have to be unpicked the moment CloudHSM arrives:

```ts
abstract class JwsKeyProvisioner {
    abstract provision(fspId: string): Promise<{publicKeyPem: string}>;
}
```

| Profile | What `provision` does |
| --- | --- |
| `vault-kv` | generates a keypair in-process, writes the private PEM to `secret/pivotal/jwskey/<fspId>`, returns the public half |
| `pkcs11` | asks CloudHSM to generate a keypair **inside the HSM**, stores the resulting `keyRef` and crypto-user credentials in Vault KV, returns the exported public half |
| `database` | generates and stores inline — legacy, unchanged |

### The return type is the load-bearing decision

`provision` returns **only a public key**. Under `pkcs11` there is no private key to return — it is
generated inside the HSM and cannot be exported, which is the entire point of the profile. A
contract that returned a private key would be unimplementable there, and would invite callers to
handle material they must never hold.

So the onboarding handler touches no private key in *any* profile, including the one where a private
key does exist. That is not a restriction imposed for tidiness; it is what makes the same code path
correct under all three.

`Pkcs11JwsKeyProvisioner` lands as a stub that throws, matching how `KeyProvider` already documents
that profile. The seam exists now; the implementation arrives with the HSM work.

---

## 3. Publication is an event, not a call and not a poll

Onboarding must not call MCM. A registry being unreachable is not a reason to refuse to onboard a
participant, and coupling the two would make it one.

Nor should trust-manager poll frequently for a change that happens a handful of times in an
environment's life. Reading MCM every minute to notice an event that rare is cost with no return.

**So onboarding emits an event and returns.** trust-manager consumes it and publishes to MCM.

```
web-pivotal ──provision──▶ Vault / HSM
     │
     ├──save──▶ participant_key   (role=self, jws_sign_enabled=0)
     │
     └──emit──▶ JetStream ──▶ trust-manager ──publish──▶ MCM
                                     │
                                     └──enable──▶ jws_sign_enabled=1
```

Three properties follow:

- **Onboarding never fails because MCM is down.** The event waits in the stream.
- **The failure is loud.** A consumer that cannot reach MCM nacks and retries, and the error surfaces
  in trust-manager's logs immediately rather than being discovered later by a rejected signature.
- **Publication is near-instant** in the normal case, rather than waiting for a sweep.

### Why JetStream makes this sound

Pivotal already runs JetStream with persistent streams and durable consumers
(`shared/nats/component/stream-provisioner.ts`). A published event survives trust-manager being
down, and an MCM outage produces redelivery rather than loss. The usual objection to event-driven
designs — that a dropped message fails silently — does not apply to a delivery mechanism that
persists and redelivers.

### The one case events cannot cover

Onboarding writes the row and then dies before publishing. No message exists, so nothing can be
redelivered, and a `self` tenant sits unpublished forever.

**The existing hourly sweep stays, as reconciliation.** `JwsKeyPublishScheduler` already does this
work idempotently: it reads what MCM holds, compares, and publishes only when MCM has nothing. At
any realistic tenant count that is a handful of reads per hour.

Its job changes, though. It is no longer how keys reach MCM — the event is. It exists only to notice
what the event missed, turning "this tenant silently never publishes" into "this tenant publishes an
hour late". The alternative that would let it be removed is a transactional outbox, writing row and
event in one transaction. That is airtight and considerably more machinery; the sweep is already
written.

### Enabling signing is trust-manager's job, not onboarding's

`jws_sign_enabled` is set **after** MCM confirms the key, by the same component that published it. A
tenant that signs before its public key is registered produces signatures no peer can verify, which
presents as a Hub rejection rather than as a provisioning problem.

Note the sweep already refuses to overwrite a key MCM holds that differs from Pivotal's, and warns
instead: peers hold one key each and cannot try both, so replacing one breaks every peer that has
not re-pulled. That case needs a human, and speed does not help it.

---

## 4. What is removed

Private keys currently reach the system through the API and the portal. That surface goes.

| Surface | Change |
| --- | --- |
| `OnboardFspCommand.Input` | drop `jwsPublicKey` and `jwsPrivateKey` — a deliberate breaking change |
| `ParticipantOnboardingPage.vue` | drop the JWS block; the page keeps **Access Public Key**, which is the DFSP-facing accessKey and unrelated |
| `ParticipantUpdateSigningKeysPage.vue` | became a **Signing Policy** page — the `jws_sign_enabled` and `jws_verify_mode` switches. The **Rotate** action was deliberately not built: rotation is still open below, and publishing a new key before peers re-pull breaks verification for all of them. An honest gap beats invented semantics |
| `HubUpdateSigningKeysPage.vue` | **corrected while building.** This design said it was public-only; it was not. The endpoint *required* a private key, and supplying one is what marks a row `self` — so an operator could have classified the Hub as a tenant this deployment signs for. The Hub is seeded as a `peer`: Pivotal verifies what it signs and never signs as it, so a private key there is material with no use. Endpoint and page now take the public key alone |
| `SIGNING_KEYS_UI_ENABLED` | deleted once there is nothing to hide |

**On that flag.** It gates the JWS block in `ParticipantOnboardingPage` and strips both keys from the
request, but the two dedicated signing-key pages do not reference it at all — an operator can still
paste a private key into `participant-add-signing-keys` today, and it lands in MySQL. Applied in one
place and missed in two is characteristic of a flag standing in for a missing capability. Removing
the inputs is the fix; adding the flag to the other pages is not.

`participant_key.jws_private_key` survives as the storage for the `database` profile and nothing
else.

---

## 5. Also required

**An endpoint for `jws_sign_enabled` and `jws_verify_mode`.** `add-signing-keys.handler.ts` is the
only code that writes either, and it always writes `false` and `off`. Nothing can turn signing on
after the fact, or move a tenant's verification between `off`, `optional` and `require`. Those are
operational switches and need an operator-facing route regardless of this design.

**Onboarding writes `participant_key`, not just `participant`.** The handler currently saves only the
pre-V3 `participant` row. Writing both keeps existing readers working while the new model takes over;
retiring the inline key columns is separate work.

**A Vault policy for web-pivotal covering KV write** on `secret/data/pivotal/jwskey/*` — and
`read` alongside it. Not a convenience: a KV v2 write replaces the whole payload, so the client
reads the existing fields and merges. Under `pkcs11` that path holds a key reference beside
crypto-user credentials, and a blind write would drop whichever it was not writing. Without `read`
the merge fails and provisioning fails with it.

**`VaultClient` has no KV write method.** It belongs to `VaultJwsKeyProvisioner`, not to onboarding.

---

## 5a. What still has to agree

`KEY_PROVIDER` decides custody for **writing** on web-pivotal and for **reading** on web-outbound
and the connectors. Those must match, or a key is written where nothing looks for it — and the
symptom is a tenant that is provisioned, published, enabled, and silently unable to sign.

Nothing enforces the agreement, and nothing detects the mismatch: each side is separately valid.
That is a gap worth closing, either by refusing to start when a deployment's signing services
disagree with its provisioning service, or by moving the setting somewhere a single value serves
both.

**Configured in `dev2-hub` on 2026-09-07**, with the read grants deliberately unequal: web-outbound
signs for every tenant it fronts and reads the whole prefix, while each connector reads exactly one
path. A shared wildcard for connectors would mean a compromise of one wallet's connector yields
every wallet's signing key, which would make "isolation comes from per-tenant Vault path policy"
untrue in the one place it matters most.

Note the two stacks name the address differently — `VAULT_ADDRESS` in the TypeScript services,
`VAULT_URL` in the Java connectors, mapped by their entrypoint. Same idea, and nothing reconciles
the names, so setting the wrong one leaves a connector silently unable to reach Vault.

---

## 6. Open

- **Event contract.** Subject naming, payload, and which stream. Existing subjects follow
  `pivotal.fspiop.response.*`; this is a different concern and may warrant its own stream.
- **Rotation.** The seam supports it — `provision` on an existing tenant mints a new key — but the
  transition needs thought: peers hold one key each, so a rotation that publishes before peers
  re-pull breaks verification for them. Probably the same shape as certificate renewal, where the
  previous key stays valid until the new one is confirmed everywhere.
- **Whether `database` should still be provisionable at all**, or whether the legacy profile should
  refuse to provision and remain read-only for existing deployments.

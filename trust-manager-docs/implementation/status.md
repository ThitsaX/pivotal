# Implementation Status

Tracks the five legs from build start to done. **This file is the single source of truth for "what
is left".** Update it in the same commit as the code it describes.

Design lives in [`design/`](../design/); the spine is
[`implementation-plan.md`](./implementation-plan.md). This file answers only *where are we*.

**Last verified against code:** 2026-08-24.

---

## Where the work actually sits — read this first

Six commits' worth of change exists; **only one of them is committed.** Anything below describing a
"commit" describes work that is written and verified, not work that is necessarily in git.

| Repo | Branch | State |
| --- | --- | --- |
| `pivotal` | `MOJ-1211/trust-manager-implementation` | **committed and pushed** — `fa0a03e` |
| `pivotal-connector` | `MOJ-1211/hub-facing-jws` | **uncommitted** in the working tree |
| `pivotal-thitsawallet-connector` | `main` — needs a branch | **uncommitted** in the working tree |

### Pending actions, in order

1. **Revert the three client forks.** `pivotal-gin-orange-java-connector`,
   `pivotal-gin-kulu-java-connector` and `pivotal-gin-big-bank-java-connector` each carry 3 modified
   files (22 insertions) that should never have been made — see the scope rule under *Connector
   fleet*. `git checkout -- .` in each; kulu and big-bank also have an untracked
   `implementation/mod_fspiop_interface/` from a local build that can be deleted.
2. **Commit `pivotal-connector` and thitsawallet.** Stage explicitly, not `git add -A`:
   thitsawallet tracks 34 build artifacts under `target/` which a local build churns, and
   `pivotal-connector`'s `.github/CODEOWNERS` change is the repo owner's, not this work's.
3. **Tag `v0.0.25` on `pivotal-connector`** when ready. 0.0.25 currently exists only in the local
   Maven repository; the connectors resolve `mod-pivotal-connector-api` from GitHub Packages, so
   nothing is deployable until the publish workflow runs.

### What to do next

**Local development — done for JWS (commits 7 and 9).** The JWS-over-Vault loop is now proven against a real
Vault; see the change log. What remains: SoftHSM2 in the stack, `implementation-plan.md` §1.4, and a
refreshed `runbooks/ceremony-local.md` (it still predates the profile rename). A full
service-to-service run through the compose stack is also still untried — commit 7 proves the
libraries interoperate, not that the deployed services do.

*Superseded — kept for the reasoning:* **Local development and end-to-end proof.** ~140 unit tests pass across both languages, the
migration is verified against real MySQL 8.0.45, and cross-language signature interop is proven — but
**nothing has ever run together.** No connector has signed a callback that web-inbound then verified
using a key it fetched from Vault.

The untested seams are exactly the agreements between the two codebases: the Kubernetes auth flow,
the KV v2 response shape, the `privateKey` field name, and the `secret/pivotal/jwskey/<fspId>` path
convention. Nothing currently exercises any of them; they hold because one author wrote both sides.

Concretely: docker-compose with Vault in dev mode seeded with a test tenant, web-outbound → Hub stub
→ web-inbound plus a connector, running with `KEY_PROVIDER=vault-kv` and `FSPIOP_USE_JWS=true`;
SoftHSM2 alongside; `implementation-plan.md` §1.4 written; `runbooks/ceremony-local.md` refreshed —
it still predates the profile rename. This also unblocks `pkcs11`, which is otherwise written blind.

---

## The five legs

Pivotal terminates or originates five distinct TLS/signature relationships. Four are in scope.

| # | Leg | Pivotal's role | Crypto duty | Repo | In scope |
| --- | --- | --- | --- | --- | --- |
| **1** | payer DFSP → `web-outbound` | server, **and the CA** | **verifies** accessKey JWS | monorepo | yes |
| **2** | `web-outbound` → Hub | client | **signs** as the payer tenant | monorepo | yes |
| **3** | `connector` → Hub | client | **signs** as its own tenant | `pivotal-connector` | yes |
| **4** | Hub → `web-inbound` | **server** | **verifies** peer + own-tenant JWS | monorepo | yes |
| **5** | `connector` → payee CBS | client, against the FSP's own CA | none | connector repos | **no** |

Two things people get wrong about this table:

- **#2 and #3 are the same signing contract with the same key.** `architecture.md` §170 — web-outbound
  signs when a tenant sends money, that tenant's connector signs when it receives. Different
  processes, one identity. They are separate rows because they are separate codebases, not separate
  designs.
- **#4 is a server leg.** Its certificate comes from the **Hub's CA via MCM inbound enrollment**, not
  from our own `pki-hub-client` CA (`hub-facing-leg.md` B1, artifact #2). Everything else in the
  hub-facing work is client-side, so this one does not follow the same issuance path.

---

## Status at a glance

| # | JWS | mTLS | Overall |
| --- | --- | --- | --- |
| 1 | 🟡 works, key custody insecure | 🔴 not started (VPN today) | **partial** |
| 2 | 🟢 **conformant + per-participant** | 🔴 not started (plaintext HTTP) | **JWS done** |
| 3 | 🟢 **JWS complete** — signer, vectors, callback wiring, Vault key access | 🔴 not started | **JWS done** |
| 4 | 🟢 **verify + cross-checks + tri-state** | 🔴 not started | **JWS done** |
| 5 | — | ⚪ out of scope (but see note) | **excluded** |

🟢 done · 🟡 partial · 🔴 not started · ⚪ out of scope

No leg is finished. The yellow cells are the important nuance: **a JWS mechanism already exists and
is wired end-to-end — it is simply disabled and produces a protected header Mojaloop will not
accept.** Treat #2/#4 as *correction* work, not greenfield.

---

## Leg #1 — payer DFSP → web-outbound

**Duty:** verify the DFSP's accessKey JWS on `/secured/sendmoney`; be the CA for DFSP client certs.

### Finished

- accessKey JWS verification on `/secured/sendmoney` — body-as-JWS-payload scheme, working in
  production.
- Per-participant key storage and lookup: `participant.access_public_key`
  (`packages/core/participant/domain/model/participant.model.ts`), served through
  `ParticipantAccessKeyStore` and the `AccessKeyStore` abstraction
  (`packages/shared/security/component/key/`).
- Admin-side key rotation: `UpdateAccessKeyCommand` / `.handler.ts` under
  `packages/core/participant/domain/command/`, with the permission gated by
  `V9__add_participant_access_key_update_permission.sql`.

### Left

- **mTLS is entirely absent.** Today this leg is protected by a VPN. Needs the DFSP-facing CA, the
  enrollment endpoint, and the fingerprint → `participant_cert` → `FSPIOP-Source` binding described in
  `dfsp-facing-leg.md` §2–§3.
- **Enrollment must use `pki/sign`, not `pki/issue`.** `dfsp-facing-leg.md` §2 currently names
  `pki/issue`, which would make Vault generate the keypair and contradicts "the DFSP's private key
  never leaves the DFSP". Recorded in `pki-issuance-flows.md` §5; the leg doc is still uncorrected.
- Replay defence (open decision **G**) and accessKey revocation semantics (open decision **E**) are
  unspecified.

---

## Leg #2 — web-outbound → Hub

**Duty:** sign outbound FSPIOP requests as the payer tenant.

### Finished

- Signing is **wired end-to-end and switchable**: `FspiopSigningInterceptor`
  (`packages/shared/fspiop/component/axios/interceptor/fspiop-signing.interceptor.ts`) is installed
  on the axios stack from `packages/core/outbound/domain/domain.module.ts:103` when
  `fspiopSettings.useJws` is true.
- Per-tenant private-key lookup by `fspiop-source` via `PrivateKeyStore` /
  `ParticipantJwsPrivateKeyStore`.
- The `FSPIOP-Signature` header is emitted in the right **shape** — `{signature, protectedHeader}`,
  payload discarded, i.e. genuinely detached.
- **The protected header is now conformant.** *Commit 1, 2026-08-23.* Was the highest-risk item in
  the programme; `Jwt.sign` emitted `{alg, typ, cty, ...allAxiosHeadersLowercased}` against a
  contract of exactly `alg`, `FSPIOP-URI`, `FSPIOP-HTTP-Method`, `FSPIOP-Source`, optional
  `FSPIOP-Destination` and `Date`. Replaced by:
  - `fspiop-uri.ts` — resource-path extraction, throws on an unrecognised path (**S5**)
  - `fspiop-protected-header.ts` — the exact field set, in signed order, correct case
  - `fspiop-signature.ts` — detached JWS built directly on `node:crypto`, bypassing `Jwt` so the
    accessKey guard on leg #1 is untouched
- **`fspiop-uri` and `fspiop-http-method` HTTP headers are now emitted.** Peer validators reject at
  the presence check before reaching the signature, so the signature alone was never going to work.
- **Conformance vectors exist** — `tests/shared/fspiop/component/vectors/fspiop-jws-vectors.json`,
  6 signing vectors and 4 reject cases, language-neutral so leg #3 executes the same file
  (`hub-facing-leg.md` §A6). 67 tests pass in `npm run test:shared-fspiop`.

### Left

- `FSPIOP_USE_JWS=false` everywhere (`docker/.env.example:51`, `docker/docker-compose.yml:8`).
- Nothing. JWS signing for this leg is complete; what remains on #2 is mTLS.
- **mTLS not started** — plain in-cluster HTTP to the Hub.
- Key custody: **resolved in commit 6**. `KEY_PROVIDER=vault-kv` reads each signing tenant's key
  from `secret/pivotal/jwskey/<fspId>` over Kubernetes ServiceAccount auth. The plaintext-MySQL path
  survives as `KEY_PROVIDER=database`, explicitly labelled legacy, so the change is not breaking.
- **Schema prerequisites** (**S2**) — *done in commit 2*: `V3__create_participant_key_table.sql`
  creates `participant_key` with `role = self | peer`, migrates existing identities, and seeds the
  `hub` peer row.

---

## Leg #3 — connector → Hub

**Duty:** sign FSPIOP `PUT`/`PATCH` callbacks as the connector's own tenant.

The connectors PUT **directly to Hub services** — confirmed in
`prod-hub-guinea-gitops/apps/pivotal/values.yaml:61-63`
(`moja-account-lookup-service`, `moja-quoting-service`, `moja-ml-api-adapter-service`). This is a
real hub-facing leg, not a call into web-outbound.

### Finished

- **The Java signer.** *Commit 3, 2026-08-24, branch `MOJ-1211/hub-facing-jws`.*
  `mod_component/…/component/fspiop/jws/` — `FspiopUri`, `FspiopProtectedHeader`, `FspiopSignature`.
  Detached JWS on `java.security.Signature` (`SHA256withRSA`); **no new Maven dependency**.
- **The shared vectors execute here too.** `fspiop-jws-vectors.json` copied into
  `mod_component/src/test/resources/`, byte-identical to the monorepo copy (same SHA-256).
- **Cross-language interop proven**, not merely assumed — see below.

### Left

The change surface, in `pivotal-connector` (the library — deployables inherit it):

| Where | Change |
| --- | --- |
| `mod_pivotal_connector_api/…/listeners/FspiopCallbackService.java` | Add `fspiop-signature` to `headers()`. Split the request **path** out of `baseUrl + "/quotes/" + id` so `FSPIOP-URI` can be populated — currently the six `putX`/`putXError` methods pre-concatenate and only the full URL reaches `put()`. `FSPIOP-HTTP-Method` is always `PUT` here. |
| `mod_component/…/fspiop/jws/` **(new)** | The signer: protected-header builder, RS256 detached JWS, `KeyProvider` interface with `vault-kv` and `pkcs11` implementations. Belongs in `mod_component` because that is the published artifact `hub-facing-leg.md` §363 calls for. |
| `mod_pivotal_connector_api/…/CoreConnectorConfiguration.java` | `Settings` gains `keyProvider`, Vault address/auth, `keyRef`, HSM credential refs. |
| `mod_component/…/retrofit/RetrofitServiceBuilder.java` | Lift the `SSLContext` construction out of `withMutualTLS()` into a reusable helper. **Do not** carry over its `hostnameVerifier -> true`. |

### Blockers specific to this leg

- **`sharedOkHttpClient` is overridden by every deployable** — `PivotalConfiguration.java:127`
  (thitsawallet), `OrangeMoneyConfiguration.java:135` (orange), and the same in kulu and big-bank.
  Anything attached to the library's `OkHttpClient` bean is dead in production. The signing/mTLS must
  ride on a separately-qualified client or an `Interceptor` that `FspiopCallbackService` installs
  itself. **Decide before writing code.**
- **Config plumbing is manual and fails closed.** `docker-entrypoint.sh` runs `set -eu` with no
  defaults, so every new property needs an entry in the entrypoint *and* the Dockerfile `ENV` block
  *and* the README table, in **each** connector repo, or the container exits on an unbound variable.
- **`Settings.prop()` is weakened in the deployables.** `PivotalConfiguration.Settings` shadows seven
  parent fields and reimplements `prop()` as exact-match `System.getProperty` only
  (`PivotalConfiguration.java:96-99`), dropping the parent's env-style and normalized-key fallbacks.
  Fix by extending rather than shadowing, or new settings will silently take defaults.

---

## Leg #4 — Hub → web-inbound

**Duty:** verify inbound FSPIOP signatures; terminate TLS as the server.

### Finished

- Verification is **implemented and switchable**: `FspInboundGuard`
  (`packages/shared/fspiop/component/nest/guard/fsp-inbound.guard.ts`) — source lookup, signature
  parse, body reconstruction, `FspiopSignature.verify()`, with FSPIOP error codes 3101/3102/3105
  mapped correctly.
- Peer public-key lookup via `PublicKeyStore` / `ParticipantJwsPublicKeyStore`.
- Body reconstruction mirrors the signer, including the bodyless-GET `{date}` convention.
- **Protected-header cross-checks added.** *Commit 1, 2026-08-23.* A valid signature only proves the
  header was not altered — not that it describes *this* request. The guard now asserts the signed
  `FSPIOP-Source`, `FSPIOP-URI`, `FSPIOP-HTTP-Method` and `FSPIOP-Destination` against the actual
  request, closing a replay hole where a signature validly produced for one endpoint passed on
  another.

### Left

- Nothing. JWS verification for this leg is complete; what remains on #4 is server-side mTLS via
  MCM inbound enrollment.
- **Server-side mTLS not started.** Needs the Hub CA as trust anchor (`GET /hub/ca`) and a Pivotal
  server certificate obtained through **MCM inbound enrollment** — a different issuance path from
  every other certificate in this programme.
- Guard is not registered globally; per-controller `@UseGuards` coverage needs an audit.

---

## Leg #5 — connector → payee CBS *(out of scope)*

Excluded by `architecture.md` §106: the FSP owns the endpoint and the CA, provisioning is manual, and
Pivotal holds no key material.

One correction to carry into the docs: `architecture.md` §116 asks "whether the connectors verify
those backends' server certificates". **They do not.** All four connectors call
`withDisableSSLVerification()` — an all-trusting `X509TrustManager`, `hostnameVerifier -> true`, and
`SSLContext.getInstance("SSL")` (`ThitsaWalletClientImpl.java:113,123` and the equivalents in orange,
kulu, big-bank). The current state is *unverified*, not *manually verified*. Worth a sentence in
`architecture.md`; not trust-manager work.

---

## Cross-cutting

| Item | Status | Note |
| --- | --- | --- |
| Protected-header contract + conformance vectors | 🔴 | Gates #2, #3, #4. Do first. |
| Key custody — `vault-kv` provider | 🟢 | Done both sides: Java commit 4, TypeScript commit 6 |
| Key custody — `pkcs11` provider | 🔴 | HSM-backed profile only |
| Vault auth for the Java connector | 🔴 | Method not chosen — see open questions |
| Regenerate `participant.jws_private_key` | 🔴 | Decision **D21**: regenerate, never migrate |
| `pki_dfsp` CA (leg #1) | 🔴 | Ceremony runbook exists; not executed |
| `pki_hub_client` CA (legs #2, #3) | 🔴 | Ceremony runbook exists; not executed |
| MCM registration of the Pivotal CA | 🔴 | `hub-facing-leg.md` B2 |
| MCM inbound enrollment (leg #4 server cert) | 🔴 | Different path from all other certs |
| Local dev environment | 🔴 | No CloudHSM/KMS on the dev machine. `runbooks/ceremony-local.md` is stale (pre-rename, single trust domain); `implementation-plan.md` §1.4 was never written |
| `NatsPullListener` ack-after-PUT | 🔴 | `handle()` acks in `finally` even on failure, so `maxDeliver=5` never retries. `hub-facing-leg.md` §244 wants this changed. Same file for all four listeners — bundle with #3 |

### Connector fleet version skew

The library fix history matters for rollout. `git tag --contains fc92ce6` → **v0.0.18+**.

**Scope rule.** Only `pivotal-connector` (the library) and `pivotal-thitsawallet-connector` (the
standard deployable that new DFSP connectors are copied from) are updated as part of this work. The
client-specific forks — `pivotal-gin-orange-java-connector`, `-kulu-`, `-big-bank-` — track live
deployments on their own release cadence and approval path, and are bumped separately by whoever
owns them. Commit 5 initially changed all four; the three client forks were reverted.

| Deployable | Pinned | Audit key | Owner |
| --- | --- | --- | --- |
| `pivotal-thitsawallet-connector` | 0.0.24 → **0.0.25** | `payerFsp` ✅ | this work |
| `pivotal-gin-kulu-java-connector` | 0.0.17 | `payerFspId` ❌ | client fork |
| `pivotal-gin-orange-java-connector` | 0.0.15 | `payerFspId` ❌ | client fork |
| `pivotal-gin-big-bank-java-connector` | 0.0.15 | `payerFspId` ❌ | client fork |

**What each client fork will need**, when its owner is ready — stated here rather than done:

1. Bump `mod-pivotal-connector-api` to 0.0.25 or later. This alone fixes the `payerFspId` audit-key
   regression (the fix landed in v0.0.18), so their PATCH-error audit messages stop being dropped as
   NOT NULL poison.
2. Add the seven JWS settings to `docker-entrypoint.sh` and the Dockerfile `ENV` block. Every one
   carries a default, so a fork that skips this still boots and behaves exactly as today — the
   settings are only needed to *enable* signing.

The upgrade path was verified before the revert: `FspClientService` is byte-identical across
v0.0.15, v0.0.17 and v0.0.24, the `Settings` property set is unchanged, and all four built clean
against 0.0.25. So the bump is safe whenever each owner chooses to take it.

---

## Build order

```
    ┌─────────────────────────────────────────┐
 1  │ protected-header contract + vectors     │  monorepo, no infra needed
    │ fix #2 sign · fix #4 verify · test loop │
    └────────────────────┬────────────────────┘
                         │  vectors are the hand-off
    ┌────────────────────▼────────────────────┐
 2  │ #3 — Java signer against those vectors  │  pivotal-connector
    └────────────────────┬────────────────────┘
    ┌────────────────────▼────────────────────┐
 3  │ key custody — vault-kv, then pkcs11     │  both repos
    └────────────────────┬────────────────────┘
    ┌────────────────────▼────────────────────┐
 4  │ mTLS across #2, #3, #4                  │  needs Hub CA exchange
    └────────────────────┬────────────────────┘
    ┌────────────────────▼────────────────────┐
 5  │ #1 DFSP-facing mTLS + enrollment        │  needs DFSP coordination
    └─────────────────────────────────────────┘
```

**Why #2 and #4 first, together.** They form a closed loop — web-inbound already verifies Pivotal's
own tenants (`architecture.md` §2), so signing and verification can be tested end-to-end inside
Pivotal with no Hub, no CA, no Java, and no HSM. It also forces the protected-header contract to be
pinned before anyone builds against it.

**Why mTLS is deliberately last.** JWS is application-level and can be flipped per participant; mTLS
is a hard cutover on a shared listener. Entangling them makes both un-rollbackable.

---

## Decisions taken for legs #2 and #4

Settled 2026-08-23. These scope the first build step; they do **not** revisit the design register in
[`README.md`](../README.md).

| # | Decision | Reasoning |
| --- | --- | --- |
| **S1** | **Build against the existing `participant.jws_private_key` column, behind a `KeyProvider` interface.** | No JWS runs in production on any leg, so the column has never held a key used for a real transaction. Decision **D21** (regenerate, never migrate) is therefore a **non-event** here — nothing to compromise, nothing to rotate. Keeps #2/#4 infra-free; `vault-kv` and `pkcs11` slot in behind the same interface, which is also what #3 needs. |
| **S2** | **Signing is enabled per participant; verification is the tri-state already specified in `architecture.md` §6.2.** | Corrected — see below. An earlier draft of this file proposed two booleans on `participant`; that contradicted the design on both counts. |
| **S3** | **No `@mojaloop/sdk-standard-components` dependency.** Own implementation, structures referenced from the source quoted in `hub-facing-leg.md` §A2. | Explicit instruction. Consistent with `hub-facing-leg.md` §A6, which already calls for shared vectors executed by both languages in CI. |
| **S5** | **`FSPIOP-URI` extraction mirrors the reference: throw on an unrecognised resource name, never degrade to the raw path.** | A degraded URI is signed and sent successfully today, because no peer verifies yet. It surfaces months later, in production, as "a peer broke us" — a signature mismatch several layers from the cause. Throwing turns that into a CI stack trace on the line that built the request. Accepted cost: the resource list must be maintained, and a new FSPIOP resource breaks signing rather than degrading. A request we cannot sign correctly is one we should not send. |
| **S6** | **Bodyless requests are not signed, and a signature on one is rejected.** | Verified against `@mojaloop/sdk-standard-components`: `baseRequests._get` carries no signing call, `baseRequests.js:219` states *"config.jwsSign is ignored here, as we don't JWS sign requests with no body"*, and `jwsSigner.sign` throws `'Cannot sign with no body'`. Pivotal's earlier `{"date":…}` substitute was an invention no peer could reconstruct — a signature that looks like protection and verifies nowhere. Reverses the convention preserved in commit 1. |
| **S7** | **`PUT /parties` is always signed, and always verified. No `jwsSignPutParties` equivalent.** | The reference gates PUT-parties signing on a separate flag (`baseRequests.js:290`), defaulting to `jwsSign` but independently disablable. Pivotal does not reproduce that opt-out on its own traffic. The **peer**-side quirk remains real and is absorbed by the inbound tri-state — see the rollout hazard below. |
| **S8** | **A connector reads one tenant's key from Vault over k8s ServiceAccount auth and signs in-process. It never delegates signing, and never touches MySQL.** | Closes open questions 1 and 2. Amends **D4**, which held only in the HSM-backed profile — see below. |
| **S4** | **No Hub-registered keypair exists**, so throwaway RSA-2048 keys are generated for the test loop. | Closes the #2↔#4 loop locally. See *Residual risk* for why a Hub round-trip would not have helped anyway. |

### S2 — corrected

Two separate switches, and neither is what an earlier draft of this file proposed.

**Signing — per participant, boolean.** `jws_sign_enabled` on the tenant's key row. Absent ⇒ off, so
the migration is non-breaking and rollout is opt-in. Safe to flip unilaterally: per
`hub-facing-leg.md` §A5, **Pivotal can start signing without coordination** — signatures are ignored
until each peer configures verification. There is no flag day on this side.

**Verification — tri-state, per `architecture.md` §6.2.** Not a boolean:

| Value | Behaviour |
| --- | --- |
| `off` | Signatures ignored. The state before phase 4 |
| `verify-if-present` | A present signature must verify; a missing one is accepted **and counted** |
| `require` | Missing or invalid signature is rejected |

`verify-if-present` is not a convenience — it is the migration state, the rollback, and the
telemetry. The per-source count of unsigned-but-accepted requests is exactly the signal that says
when `require` is safe. Collapsing it to a boolean removes the only rollback the plan has.

### S8 — connector key access

Each connector **is** exactly one tenant, so it needs one key, not a keyed lookup. That collapses
most of the design.

```
connector  →  Vault, authenticated by its Kubernetes ServiceAccount
           →  secret/pivotal/{keyref|jwskey}/{its own fspId}   ← policy grants this one path
           →  read once at startup, cached
           →  sign in-process:  PKCS#11 C_Sign (HSM-backed)  |  Java JCA (KMS-backed)
```

| | HSM-backed | KMS-backed |
| --- | --- | --- |
| Vault path holds | `keyRef` + crypto-user credentials | the private key PEM |
| Key material in the connector | **none** | **PEM in process memory** |
| What provides isolation | the HSM, plus per-tenant crypto users | **per-tenant Vault path policy** |

**No database access.** `keyRef` is authoritative in Vault KV (decision 17); MySQL is only a mirror.
Issuing connectors database credentials would widen the blast radius for nothing.

**No delegated signing.** Routing connector signatures through web-outbound would put an HTTP hop on
every callback, make web-outbound a hard runtime dependency of every connector, and invert the goal —
web-outbound reads *every* tenant's key, so it widens the very blast radius D4 exists to narrow.

**Not environment variables.** `implementation-plan.md` §1.2 rules them out explicitly: they sit in
the Deployment manifest, show up in `kubectl describe`, need a redeploy to rotate, require a manifest
edit per tenant, and leave no record of who read them. An env-supplied PEM is a **dev and CI fixture
only** and must never become a deployment path — the `KeyProvider` seam exists so the two cannot be
confused.

### Prerequisites S2 depends on — both from `hub-facing-leg.md` §A4

These are **not optional**, and they land before the flags do:

1. **`participant_key` table with `role = self | peer`.** `participant` conflates tenants (need a
   private key) with peers (need only a public key), and `add-signing-keys` marks `jwsPrivateKey`
   `@IsNotEmpty()`, so a peer cannot be represented at all today. §A4 calls this a **prerequisite,
   not a normalization**. The inbound guard reads both roles — when two Pivotal-fronted tenants
   transact, the Hub relays the payer's request back with `fspiop-source` naming one of *our* tenants,
   so web-inbound verifies a signature web-outbound produced. In a mostly-Pivotal-fronted deployment
   that is the **common** case, not an edge one.
2. **Seed a `hub` participant.** No migration or seed creates one. Without it, enabling verification
   fails **every** Hub-originated error with 3105. The cache keys on `participant.name` verbatim, so
   `hub` and `Hub` do not match — fix the casing at seed time. The Hub's public key normally comes
   from a Kubernetes secret holding an X.509 **certificate**: extract with
   `openssl x509 -pubkey -noout` against `tls.crt`, and re-extract whenever the Hub rotates.

### Rollout hazard from S7 — peers may not sign `PUT /parties`

`baseRequests.js:290` gates PUT signing as:

```js
if (responseType === Mojaloop && this.jwsSign &&
    (resourceType === 'parties' ? this.jwsSignPutParties : true)) {
```

So a peer can run with `jwsSign` on and `jwsSignPutParties` off, signing everything **except**
`PUT /parties`. Under **S7** Pivotal always verifies party callbacks, so moving such a peer to
`require` rejects every one of them.

This is not an argument against S7 — it is an argument for the tri-state being evaluated
**per source**. `verify-if-present` absorbs it silently, and the per-source unsigned-but-accepted
counter is what reveals it. Confirm a peer signs `PUT /parties` before moving that peer to
`require`.

### Residual risk from S3 + S4 — corrected

An earlier draft said the first true conformance proof is a Hub round-trip. **It is not.** Per
`hub-facing-leg.md` §A5 the Hub performs no JWS validation at all — no `JwsValidator` in
`quoting-service/src`, `account-lookup-service/src`, or `ml-api-adapter/src`, and
`@mojaloop/central-services-shared` has no validation implementation. Hub JWS config is
**signing-only**.

The real validators are **peer DFSPs**, via `sdk-scheme-adapter` / PM4ML
(`InboundServer/middlewares.js`). So:

- A Hub round-trip would not have caught a misread of the protected-header spec. S4 costs less than
  it first appeared.
- The genuine risk is unchanged and sits elsewhere: with no differential test, **#2 and #4 verify
  each other while both being wrong in the same way**. The loop is closed but self-referential, and
  the first external evidence arrives when a peer DFSP turns on verification.

Mitigations, all in scope for this step:

1. Vectors hand-written from the **literal source** quoted in §A2, stored as language-neutral JSON so
   leg #3 consumes the identical file — this is `hub-facing-leg.md` §A6's "shared conformance
   vectors", executed by both languages in CI.
2. Emit the `fspiop-uri` and `fspiop-http-method` **HTTP headers**. Peer validators cross-check these
   against the protected header, so a mismatch fails loudly rather than silently.
3. Because signing is unilateral and ignored until peers opt in, **turn signing on early in a real
   environment** and leave it running. It costs nothing and converts the first peer enabling
   verification into a live conformance test rather than a surprise.

---

## Open questions blocking the start

**Nothing blocks legs #2, #3 or #4.** S1–S8 clear the path. Questions 1 and 2 are closed — see
**S8**; question 2 was never actually open, `implementation-plan.md` §1.2 already specified it and
this file listed it in error. These remain open for the later steps:

1. **Hub cutover sequencing.** Signing cannot be enabled before the Hub trusts our public key.
   Partially answered by **S2** — the flip is per participant. What remains is whether the Hub offers
   a both-accept window per participant, or rejects unsigned traffic the moment a key is registered.
   — **blocks production cutover**
3. **Which trust domain issues the `connector → Hub` client cert** — our own `pki_hub_client`, or MCM
   enrollment? `architecture.md` leaves it as "Istio mesh **or** MCM-enroll if remote", and the two
   target deployments may differ. — **blocks mTLS only**

---

## Change log

### Commit 1 — the signing contract · 2026-08-23

Legs #2 and #4, JWS only. No schema change, no infrastructure.

| File | Change |
| --- | --- |
| `packages/shared/fspiop/component/fspiop-uri.ts` | **new** — `FSPIOP-URI` extraction; throws on an unrecognised resource (**S5**) |
| `packages/shared/fspiop/component/fspiop-protected-header.ts` | **new** — the exact contract field set, in signed order |
| `packages/shared/fspiop/component/fspiop-signature.ts` | rewritten — detached JWS on `node:crypto`, no longer routed through `Jwt` |
| `.../axios/interceptor/fspiop-signing.interceptor.ts` | rewritten — builds the header from request metadata, emits `fspiop-uri` and `fspiop-http-method` |
| `.../nest/guard/fsp-inbound.guard.ts` | new verify API + protected-header cross-checks against the actual request |
| `tests/shared/fspiop/component/vectors/fspiop-jws-vectors.json` | **new** — 6 signing vectors, 4 reject cases, language-neutral |
| `tests/shared/fspiop/component/*-test.ts` | **new/rewritten** — 49 new tests; 67 pass across the package |

**Verification:** `npm run test:shared-fspiop` → 67 pass, 0 fail. `npx tsc --noEmit` adds no new
errors (11 pre-existing remain: 9 portal `import.meta`, 1 send-money mapper, 1 `jwt-test`).
`npm run build:shared-fspiop` succeeds.

**Two pre-existing problems found, not fixed:**

1. **`jwt-test.ts` has been failing on `main`.** `Jwt.sign(key, 'RS512', headers, payload)` at line 89
   does not match the current overloads (TS2554). Verified by stashing — it fails without any of
   this work. Unrelated to the legs; worth a separate fix.
2. **Every `node --test` script in `package.json` is broken on Node 20.** They pass quoted globs, and
   `node --test` only accepts glob patterns from Node 21; this repo runs v20.10.0. So
   `npm run test:shared-security` and its siblings currently find no files and exit without running
   anything. `test:shared-fspiop` uses shell-expanded globs instead and works — the other scripts
   need the same treatment, or a Node upgrade.

**Deliberately deferred to commit 2:** `participant_key` table with `role = self | peer`, the `hub`
participant seed, `jws_sign_enabled`, and the inbound tri-state.

**Bodyless requests — settled, see S6.** Commit 1 initially preserved Pivotal's `{"date":…}`
substitute payload for `GET /parties/{type}/{id}`. Reading the reference source settled it the other
way: `_get` never signs, and `jwsSigner.sign` throws `'Cannot sign with no body'`. The substitute was
removed from both the interceptor and the guard before this commit closed — the signer skips
bodyless requests, and the guard rejects a signature on one rather than accepting it against a
reconstructed payload.

### Commit 2 — identity, policy and the tri-state · 2026-08-24

Completes the JWS half of legs #2 and #4.

| File | Change |
| --- | --- |
| `packages/core/participant/domain/sql/V3__create_participant_key_table.sql` | **new** — `participant_key`, data migration, `hub` peer seed |
| `packages/core/participant/domain/model/participant-key.model.ts` | **new** — entity + `ParticipantKeyRole` |
| `packages/core/participant/domain/repository/participant-key.repository.ts` | **new** |
| `.../component/store/participant-jws-policy-store.ts` | **new** — DB-backed `JwsPolicyStore` |
| `.../component/store/participant-signing-keys-cache.ts` | JWS material now read from `participant_key`; accessKey stays on `participant` |
| `.../command/add-signing-keys.handler.ts` | writes `participant_key` only; preserves flags and role |
| `packages/shared/fspiop/component/fspiop-verify-mode.ts` | **new** — the tri-state enum + tolerant parser |
| `packages/shared/fspiop/component/security/jws-policy-store.ts` | **new** — abstraction + `StaticJwsPolicyStore` |
| `.../nest/guard/fsp-inbound.guard.ts` | per-source tri-state + unsigned-accepted counters |
| `packages/shared/fspiop/component/fspiop-settings.ts` | optional `defaultJwsVerifyMode` |
| `packages/apps/web-inbound/{required.settings,web-inbound.module}.ts` | reads `FSPIOP_JWS_VERIFY_MODE`, builds the policy store |
| `tests/shared/fspiop/component/{fspiop-verify-mode,nest/fsp-inbound-guard}-test.ts` | **new** — 21 tests |

**Verification:** 88 tests pass, 0 fail. `tsc --noEmit` adds no new errors. `shared-fspiop`,
`web-inbound`, `web-outbound` and `web-pivotal` all build. The migration was applied against a
throwaway MySQL 8.0.45 container — V1→V2→V3 with seed data, confirming the data migration, the
`hub` seed, both CHECK constraints, case-sensitive `fsp_id`, and idempotency on re-run.

**Design notes worth carrying forward:**

- **Signing is gated by the key store, not the interceptor.** `ParticipantSigningKeysCache` only
  publishes a private key when `jws_sign_enabled` is set, and the interceptor already skips a source
  with no key. Per-participant signing therefore needed no change on the signing path.
- **A source with no row falls back to the deployment default**, it is not rejected. Rejecting an
  unknown peer must be a consequence of setting the default to `require`, not of a missing row.
- **A present-but-invalid signature is always rejected**, including under `verify-if-present`. That
  mode is tolerant of *absence*, never of *failure*.
- **`fsp_id` is case-sensitive** (`utf8mb4_0900_as_cs`). The cache matches ids verbatim, so a
  case-insensitive unique key would let `hub` and `Hub` collapse into a row that then fails to match
  at lookup. §A4 flagged this; the collation is what enforces it.
- **Role is inferred from private-key presence** on migration and on first registration, and
  preserved thereafter — a key update is not a reclassification.

**Operator note.** A deployment whose `participant` table already holds a `hub` row keeps it: the
seed is `INSERT IGNORE`, so an existing key is never overwritten. A deployment that spells it
differently — `Hub`, or a custom `FSPIOP_SWITCH_ID` — gets *two* rows, its own and the seeded `hub`.
That is deliberate: silently merging them would be worse than surfacing them. Reconcile before
enabling verification.

### Commit 3 — the Java signer · 2026-08-24

Leg #3, first half. Library only (`pivotal-connector`, branch `MOJ-1211/hub-facing-jws`); the four
deployables are untouched and their version bumps are a separate change.

| File | Change |
| --- | --- |
| `mod_component/…/component/fspiop/jws/FspiopUri.java` | **new** — resource extraction, throws on unknown (**S5**) |
| `mod_component/…/component/fspiop/jws/FspiopProtectedHeader.java` | **new** — exact field set, `LinkedHashMap` preserves signed order |
| `mod_component/…/component/fspiop/jws/FspiopSignature.java` | **new** — detached JWS, `SHA256withRSA`, no new dependency |
| `mod_component/src/test/resources/fspiop-jws-vectors.json` | **new** — byte-identical copy of the monorepo vectors |
| `mod_component/…/jws/{FspiopUri,FspiopSignature,FspiopJwsConformance}UnitTest.java` | **new** — 25 tests |

**Verification:** 27 tests pass in `mod_component` (2 pre-existing + 25 new); the full reactor builds
and installs.

**Cross-language interop is proven, not assumed.** Matching your own vectors proves only internal
consistency — both implementations could be wrong in the same way. So the TypeScript signer produced
signatures over all six vectors with a freshly generated RSA-2048 key, and the **Java** verifier
checked them: 6 of 6 verified. That is the first evidence the two implementations agree on the
signing input byte-for-byte. Reproduce by signing the vectors in the monorepo and verifying the
output with `FspiopSignature.verify` in the connector; the harness was throwaway and is not committed,
since the Java repo has no access to the TypeScript one in CI.

**One deliberate divergence from the TypeScript implementation, documented at the class:**

TypeScript re-stringifies the payload before signing, because it is handed a parsed object and axios
may serialize it again on the way out. Java signs the caller's bytes **verbatim**, because
`FspiopCallbackService` already holds the exact bytes it is about to transmit — and signing what is
actually sent removes any chance of the signed bytes and the wire bytes diverging, which fails at the
peer with no local symptom.

The two agree for every FSPIOP payload, since all fields are strings and both emit compact JSON, and
the vectors pin that agreement. **They would diverge on a JSON number**: Jackson preserves `1.0`
where `JSON.stringify` renders `1`. FSPIOP amounts are strings so this does not arise today — but do
not introduce a numeric field on a signed body without revisiting it.

**Also worth knowing:** the signing classes use a **private, minimally-configured `ObjectMapper`**,
never the shared application bean. That bean carries `NON_NULL`/`NON_EMPTY` inclusion and
`WRITE_NUMBERS_AS_STRINGS`, and any future change to it would silently alter the bytes being signed.
Serialization here is wire contract, not application concern.

### Commit 4 — connector signing path and Vault key access · 2026-08-24

Completes the JWS half of leg #3. Library only; the four deployables are untouched.

| File | Change |
| --- | --- |
| `mod_component/…/fspiop/jws/Pem.java` | **new** — PKCS#8 / X.509 decoding, JDK only |
| `mod_component/…/fspiop/jws/JwsKeyProvider.java` | **new** — the custody seam; one tenant, not a lookup |
| `mod_component/…/fspiop/jws/VaultJwsKeyProvider.java` | **new** — reads `<mount>/pivotal/jwskey/<fspId>` |
| `mod_component/…/fspiop/jws/StaticJwsKeyProvider.java` | **new** — tests and local dev only |
| `mod_component/…/fspiop/jws/FspiopSigningInterceptor.java` | **new** — OkHttp interceptor; signs, sets `fspiop-uri` / `fspiop-http-method` |
| `mod_component/…/vault/VaultClient.java` | **new** — k8s login + KV v2 read; **no Vault SDK dependency** |
| `mod_pivotal_connector_api/…/jws/FspiopJwsSigner.java` | **new** — assembles the path, reads the key once at startup |
| `…/CoreConnectorConfiguration.java` | `Settings` gains `fspiopUseJws` and six Vault settings |
| `…/listeners/FspiopCallbackService.java` | installs the interceptor on a derived client |
| `mod_component/…/jws/FspiopSigningInterceptorUnitTest.java` | **new** — 7 tests |

**Verification:** 34 tests pass in `mod_component`; the full reactor builds, tests and installs.

**Three decisions worth carrying forward:**

- **The six `putX` methods did not need changing.** `FspiopUri.extract` already strips scheme, host
  and base path, so the interceptor derives `FSPIOP-URI` from the outgoing OkHttp URL. The
  path-splitting refactor this file previously called for is unnecessary.
- **`FspiopJwsSigner` is a component-scanned `@Component`, not a `@Bean` on
  `CoreConnectorConfiguration`.** Deployables exclude that configuration and import their own; some
  extend it and inherit its beans (`PivotalConfiguration`), others do not
  (`OrangeMoneyConfiguration`). A `@Bean` there would have reached part of the fleet only. Every
  deployable scans `com.thitsaworks.mojaloop.coreconnector`, so a component reaches all four with no
  deployable repo changing.
- **`FspiopCallbackService` derives its own client** — `http.newBuilder().addInterceptor(...)`.
  Relying on the injected client to carry signing would fail in production, where all four
  deployables override `sharedOkHttpClient`. `newBuilder()` shares the connection pool and
  dispatcher, so this costs nothing.

**Enabling signing without Vault configured throws at startup**, rather than degrading to unsigned.
A connector that believes it is signing but is not is the failure mode this whole leg exists to
prevent. A *missing key* at a configured path is different and only warns: peers ignore signatures
until they enable verification, so that state is survivable and visible in the log.

**Still to do on leg #3, and it is not library work** — the deferred (b) change, one per deployable
repo: seven new settings in `docker-entrypoint.sh` and the Dockerfile `ENV` block, plus the
`mod-pivotal-connector-api` version bump. `set -eu` with no defaults means a missed variable is a
container that will not boot. The settings are `fspiopUseJws`, `vaultUrl`, `vaultRole`,
`vaultKubernetesAuthPath`, `vaultKvMount`, `vaultJwsKeyPathPrefix`, `vaultServiceAccountTokenPath` —
**no key material among them**, which is the point of S8.

### Commit 5 — deployable plumbing and version bump · 2026-08-24

The deferred **(b)** change: four connector repos, plus the library revision bump that gives them a
target.

| Repo | Change |
| --- | --- |
| `pivotal-connector` | `<revision>` 0.0.24 → **0.0.25** (flattened POMs regenerate) |
| `pivotal-thitsawallet-connector` | seven `-D` settings in `docker-entrypoint.sh`, seven `ENV` defaults in the Dockerfile, `mod-pivotal-connector-api` → 0.0.25, README config table extended, new **FSPIOP JWS signing** section |

The three client forks were changed too and then reverted — see the scope rule above.

**Verification:** all four build clean against 0.0.25. Each `docker-entrypoint.sh` was dry-run with a
stub `java` and only the Dockerfile's own `ENV` values, confirming it execs with all seven new
arguments and still ends in `-jar app.jar`.

**Every new variable carries a default** (`${VAR:-default}`). The entrypoints run under `set -eu`, so
a bare `${VAR}` reference to something an existing deployment does not set would abort the container
on upgrade. The defaults reproduce today's behaviour exactly: signing off, Vault unconfigured.

**A bug caught by dry-running rather than by review.** The first version of this change placed
explanatory comments *inside* the `\`-continued argument list. A `#` there does not comment the line
out — it **terminates the command**, so `java` would have launched without its jar and the following
lines would have run as shell commands. `sh -n` passes it cleanly; only executing it reveals the
fault. All four containers would have failed to start. Comments now sit above `exec java`.

**Not deployable yet.** 0.0.25 exists only in the local Maven repository. It reaches the connectors'
builds when someone tags `v0.0.25` on `pivotal-connector` and the publish workflow pushes it to
GitHub Packages.

### Commit 6 — `vault-kv` key access in the monorepo · 2026-08-24

Retires the **S1** interim state. The KMS-backed profile is now complete for JWS in **both**
languages: connectors read their own key (commit 4), web-outbound reads every tenant's (here).

| File | Change |
| --- | --- |
| `packages/shared/vault/component/vault-settings.ts` | **new** — `KeyProvider` enum, `VaultSettings` |
| `packages/shared/vault/component/vault-client.ts` | **new** — k8s login + KV v2 read, axios, no SDK |
| `packages/core/participant/domain/component/store/jws-private-key-source.ts` | **new** — abstraction + `Database` and `Vault` implementations |
| `.../store/participant-signing-keys-cache.ts` | private keys now come from the source; public keys stay in MySQL |
| `.../participant/domain/domain.module.ts` | selects the source from `KEY_PROVIDER` |
| `packages/apps/{web-outbound,web-inbound,web-pivotal}/required.settings.ts` | `keyProvider()` and `vaultSettings()` |
| `tests/shared/vault/…`, `tests/core/participant/…` | **new** — 17 tests |

**Verification:** 105 tests pass across the three suites (88 fspiop, 6 vault, 11 participant); the
three apps build.

**Design notes:**

- **Registry and custody are separate stores.** `participant_key` answers *who exists and what is
  switched on* — public, queryable, MySQL. Vault answers *what the key is*. One store per value,
  settled decision 17. Public keys deliberately stay in MySQL: they are not secret, and routing them
  through Vault would put a round trip in the inbound verification path for nothing.
- **web-outbound reads every tenant's key; a connector reads one.** Same per-tenant path model, more
  paths. That asymmetry is where this component's blast radius sits (`architecture.md` §4.8) and it
  is inherent to web-outbound signing as whichever tenant is the payer.
- **A Vault failure carries the previous key forward.** A blip must not silently stop a tenant
  signing — the key has not changed, only our ability to re-read it. The client's token is
  invalidated so the next attempt re-authenticates, which is the likeliest fix. A tenant with no
  previously loaded key is omitted and logged at error.
- **Switched on but never provisioned logs at error**, not warn: someone believes that tenant is
  signing and it is not.
- **`KEY_PROVIDER=vault-kv` without Vault configured throws at startup.** Falling back would leave
  keys in the database while an operator believed otherwise. `pkcs11` throws as not-yet-implemented
  rather than silently behaving like something else.
- **Not breaking.** An absent `KEY_PROVIDER` keeps the database source, so existing deployments are
  unaffected until they opt in.

**What this does not do.** Nothing *writes* keys into Vault — that is trust-manager's job
(`architecture.md` §7) and no part of it exists. Until then, provisioning is a manual
`vault kv put secret/pivotal/jwskey/<fspId> privateKey=@key.pem`. The same is true of the Java
connector. This commit completes key *access*; key *lifecycle* — rotation, onboarding, revocation —
remains unbuilt.

### Commit 7 — the first integration proof · 2026-08-24

Closes the largest evidence gap: until now every test mocked Vault, and the agreements between the
two codebases were held together only by one author having written both sides.

| File | Change |
| --- | --- |
| `packages/shared/vault/component/vault-settings.ts` | `VaultAuthMethod` — `kubernetes` (production) or `token` (development) |
| `packages/shared/vault/component/vault-client.ts` | honours the token method, warning loudly when it does |
| `tests/integration/jws-vault-loop-test.ts` | **new** — Vault → key → sign → verify, against a real Vault |
| `docker/docker-compose.yml` | `vault` and `vault-seed` services behind a `vault` profile; `KEY_PROVIDER` / `VAULT_*` / `FSPIOP_JWS_VERIFY_MODE` env |
| `docker/.env.example` | the same settings, documented |
| `package.json` | `test:integration` |

**What the integration test actually exercises**, none of which a unit test reaches: the real KV v2
wire protocol and response envelope, the `privateKey` field name, the
`<prefix>/<fspId>` path convention, PEM round-tripping through Vault, and then the loaded key
signing a request that `FspInboundGuard` accepts in `require` mode. A third case replays a valid
signature against a different resource and confirms the cross-check rejects it.

**It skips, rather than fails, with no Vault running** — so it cannot break a machine or a CI job
that has not started one. Verified both ways.

**Reproduce:**

```
docker compose -f docker/docker-compose.yml --profile vault up -d vault vault-seed
VAULT_IT_TOKEN=root-dev npm run test:integration
```

`vault-seed` generates a throwaway RSA-2048 keypair per tenant and writes the private half to the
path the services read. It stands in for trust-manager, which does not exist — in a deployment
nothing populates those paths automatically.

**A development-only auth path was added, deliberately narrow.** Outside Kubernetes there is no
kubelet to project a ServiceAccount token, so a Vault in Docker is unreachable by the production
method. `VAULT_AUTH_METHOD=token` covers that and logs a warning whenever it is used; the default
stays `kubernetes`. This is a credential in configuration, which is exactly what the Kubernetes
method exists to avoid — it must not reach a deployment.

**What this still does not prove.** The libraries interoperate; the *services* have not been run
against each other. A full compose run — web-outbound signing a real transfer that web-inbound
verifies, with `KEY_PROVIDER=vault-kv` — is the next increment, and the wiring for it is now in
place.

### Commit 8 — Vault auth wiring, and a blocked service-level run · 2026-08-24

Attempted the full service-to-service JWS run. It surfaced one real bug and one environment
constraint that the local-development story has to solve before it can proceed.

**Bug fixed: `VAULT_AUTH_METHOD` and `VAULT_TOKEN` were never read.** Commit 7 added them to
`docker-compose.yml` and `.env.example` but not to `required.settings.ts`, so `vaultSettings()` always
built Kubernetes auth and `KEY_PROVIDER=vault-kv` failed at startup with *"Vault is not configured"*
even when a token was supplied. Now wired in all three apps, with an unrecognised value throwing
rather than silently defaulting. The error message also named only `VAULT_ROLE`; it now names the
token path too.

**Found by running the service, not by testing it.** Every unit test constructs `VaultSettings`
directly and so never exercised the settings-reading path. This is the class of defect the
integration work exists to catch.

**Blocker: per-app `.env` overrides the process environment.**
`packages/apps/*/main.ts` calls `loadDotEnv({path: moduleEnvPath, override: true})`, so a developer's
`packages/apps/web-inbound/.env` wins over anything exported by a test harness. On this machine that
file points at a local MySQL with different credentials, so the service silently connected there —
`[::1]:3306` with `central_ledger` — while its own settings object correctly resolved the values that
had been exported. Diagnosed by instrumenting the TypeORM factory; the probe was reverted.

This is deliberate for local development and should not simply be removed. But it means **an
environment-variable harness cannot drive these services**, and the local-development story has to
account for it. Two workable paths:

1. **Run the services from the compose stack under a separate project name**
   (`docker compose -p pivotal-jws ...`), so they get their own volumes and images carry no
   developer `.env`. Closest to how they actually run, and non-destructive to an existing stack.
2. **Give the harness its own `.env`**, written and removed around the run. Faster, but mutates a
   developer's working tree and leaves it wrong if the run crashes.

Path 1 is the better basis for a repeatable local-development story. Neither has been done yet.

**State:** unit and integration suites remain green — 88 fspiop, 6 vault, 11 participant, 3
integration against a real Vault. No service-to-service run has been completed.

### Commit 9 — the service-level loop, proven · 2026-08-24

The gap that had been open since commit 1 is closed: **the deployed services interoperate**, not just
the libraries.

Run under an isolated compose project (`-p pivotal-jws`), which sidesteps the `.env` blocker from
commit 8 — images carry no developer `.env`, and a separate project name means its own volumes,
network and offset ports, so an existing stack is untouched.

| File | Change |
| --- | --- |
| `scripts/verify-jws-service-loop.py` | **new** — drives signed and attack cases against a running web-inbound |
| `docker/jws-loop.env.example` | **new** — the isolated project's settings, with run instructions |

**What actually ran.** web-inbound in a container, `KEY_PROVIDER=vault-kv`, guard global,
`FSPIOP_JWS_VERIFY_MODE=require`. Its signing key came from Vault; the verifying public key came from
`participant_key` in MySQL — `jws_private_key` deliberately **NULL**, so the private half existed
only in Vault.

| Case | Result |
| --- | --- |
| Correctly signed | **HTTP 200** |
| Unsigned | **417** · 3102 missing `fspiop-signature` |
| Valid signature replayed at another resource | **401** · 3105 *"Signed FSPIOP-URI does not match"* |
| Tampered body | **401** · 3105 verification failed |

The third case is the one worth noting: it is the replay hole the protected-header cross-checks were
added to close, and it is now demonstrated shut through real HTTP rather than argued from code.

**The tri-state was proven live.** With `jws_verify_mode` switched to `verify-if-present` by a single
`UPDATE`, an unsigned request was accepted within the 5-second cache refresh — no restart, no
redeploy — and the guard logged *"Accepting unsigned FSPIOP requests from 'payerfsp' under
verify-if-present."* That is the per-participant rollout mechanism working end to end.

**Still not covered.** web-outbound was not exercised — the loop was driven by an external signer
standing in for it, because a full send-money flow needs central-ledger and a Hub. The signing path
it would use is the same interceptor already covered by unit tests and the vectors, but the
*service* has not signed a live request.

### Commit 10 — one stack, shared database, real tenant · 2026-08-24

Commit 9 proved the loop in an isolated project with synthetic tenants. This runs it in the **single
`pivotal-stack` project**, against the **existing** Mojaloop test-harness MySQL and a **real**
participant.

| File | Change |
| --- | --- |
| `docker/docker-compose.shared-db.yml` | **new** — overlay that drops the bundled MySQL and points services at the shared one |
| `docker/jws-loop.env.example` | rewritten for the single-stack, shared-DB layout |
| `scripts/verify-jws-service-loop.py` | defaults updated to that layout |

**No second MySQL.** `ml-core-test-harness` already runs one holding the `pivotal` database. The
overlay uses `!override` on `depends_on` to remove the bundled `mysql` while keeping the real
dependencies — `nats`, `redis`, `web-inbound` — and points every service at
`host.docker.internal:3306`.

**V3 was applied to the real database through the application's own migration runner**, so the
history row and hash are recorded exactly as a normal web-pivotal boot would record them. It
validated the role inference against live data: `wallet1`, `wallet2` and `cofinagn` migrated as
`self` because they hold private keys; `hub` was seeded as `peer`; every row landed with signing off
and verification off, so the migration changed no behaviour.

**A real tenant was migrated to Vault custody.** `wallet1`'s private key was moved from
`participant_key` into `secret/pivotal/jwskey/wallet1`, and the column set to `NULL`. Its public key
stayed in MySQL. The service then signed and verified using a key it read from Vault, with no
plaintext key left in the database — the migration path a deployment would follow.

**The per-source override was proven, not just the mode.** The deployment default was
`FSPIOP_JWS_VERIFY_MODE=off`, while `wallet1`'s row said `require`. Unsigned requests from `wallet1`
were rejected. Enforcement therefore came from the participant row, not the global setting, which is
what makes per-participant rollout work.

| Case | Result |
| --- | --- |
| Correctly signed, key from Vault | **HTTP 200** |
| Unsigned | **417** · 3102 |
| Replayed at another resource | **401** · 3105 |
| Tampered body | **401** · 3105 |

**Environment conventions now fixed:** one compose project (`pivotal-stack`) for Pivotal services;
MySQL, Kafka and the hub's own Redis come from `ml-core-test-harness`; `mojaloop-demowallet` is
available as the DFSP backend for the ThitsaWallet connector.

**Left on the JWS story:** web-outbound has still not signed a live send-money flow. With the hub
harness already running, that is now possible and is the last piece of JWS evidence.

### Commit 11 — completing the compose environment · 2026-08-25

`docker-compose.yml` did not supply every variable the services require at startup, so some of them
could not run from the stack at all. Found when web-outbound failed on a missing
`PREFIX_ORACLE_ENDPOINT`.

Rather than fix one variable, the gap was measured across every service by diffing
`readRequired*('…')` in each `required.settings.ts` against the rendered compose environment:

| Service | Was missing |
| --- | --- |
| `web-outbound` | `PREFIX_ORACLE_ENDPOINT`, `PREFIX_ORACLE_CACHE_TTL_MS` (+ two optional timeouts) |
| `web-pivotal` | `REDIS_URL`, `PIVOTAL_IAM_JWT_SECRET`, `PIVOTAL_IAM_ADMIN_SEED_EMAIL`, `PIVOTAL_IAM_ADMIN_SEED_TEMP_PASSWORD` |
| `app-auditor` | `REDIS_URL` |

All now supplied with development defaults; the IAM secret and seed password are marked as values a
deployment must replace. Every service now passes the check.

**A second failure had the same shape but a different cause.** web-outbound had also been started
with `DB_WRITE_HOST=127.0.0.1` and credentials `root`/`admin123` — values present in no file in the
repository. They came from **shell environment variables**, which outrank `--env-file` in Compose's
precedence. Inside a container `127.0.0.1` is the container itself, so the connection could never
succeed. Recreating with `env -i` fixed it.

Worth remembering when a container's configuration looks impossible: `docker compose … config`
renders what Compose resolved, and `docker inspect` shows what the container actually received. The
two differing points at the shell.

### Commit 12 — `require` was unsatisfiable for bodyless requests · 2026-08-25

Found by a real transfer rather than a test. `account-lookup-service` logged:

```
max retries exceeded for HTTP request! Request failed with status code 417
{"errorCode":"3102","errorDescription":"Missing mandatory header: fspiop-signature."}
```

**The chain.** web-outbound sends `GET /parties/{type}/{id}`, which is **unsigned by design** — a
detached JWS signs the body and a GET has none, so no implementation signs one (decision **S6**;
the reference throws *"Cannot sign with no body"*). ALS then forwards that GET to web-inbound
**preserving the original `fspiop-source`**. The guard saw a source configured `require`, found no
signature, and rejected.

**So `require` could never be satisfied for the parties lookup** — by us or by any peer. A mode that
cannot be turned on is not a mode.

**Fix.** The guard now accepts an unsigned request that carries no body, in every mode. A signature
that is *present* on a bodyless request is still rejected: it cannot have been produced over
anything the receiver can reconstruct. Bodyless requests are also excluded from the
unsigned-but-accepted counters — they are not evidence a source is behind on signing, and letting
them inflate the telemetry would obscure the signal that decides when `require` is safe.

Two regression tests added; 90 pass in `shared-fspiop`.

**Worth drawing out:** every prior proof drove `PUT` traffic, so the entire GET path went unexercised
until a real transfer ran through a real Hub. Neither the unit tests, the Vault integration test, nor
the service-level loop could have caught this — the flaw was in what none of them thought to send.

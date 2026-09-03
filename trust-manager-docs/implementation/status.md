# Implementation Status

Tracks the five legs from build start to done. **This file is the single source of truth for "what
is left".** Update it in the same commit as the code it describes.

Design lives in [`design/`](../design/); the spine is
[`implementation-plan.md`](./implementation-plan.md). This file answers only *where are we*.

**Last verified against code:** 2026-09-04.

---

## Where the work actually sits — read this first

**Every leg in scope now has its mTLS code written, and leg #1 has been proven running.** JWS was
complete across all three repositories; hub-facing mTLS followed on 2026-09-02; the DFSP-facing leg
— issuance, operator screens and request-time enforcement — landed 2026-09-03/04 and is the first
to have been exercised against a real mutual-TLS handshake through an Istio gateway.

**What remains is enablement and ceremony, not application code.** The hub-facing legs wait on the
Hub edge accepting client certificates. The DFSP-facing leg waits on a gateway in the gitops
repositories and on each DFSP enrolling. Both trust domains are still rooted in **rehearsal** KMS
keys, so no production root exists yet. Leg #1 additionally has replay defence (**G**) and accessKey
revocation (**E**) unspecified.

| Repo | Branch | Head | Tree |
| --- | --- | --- | --- |
| `pivotal` | `MOJ-1211/trust-manager-implementation` | `f6dbe70` — make the portal runtime config and container port work | clean |
| `pivotal-connector` | `MOJ-1211/hub-facing-jws` | `13df358` — present a hub client certificate from connectors | clean |
| `pivotal-thitsawallet-connector` | `MOJ-1211/hub-facing-jws` | `2d0e0e8` — wire the hub client certificate into the connector | clean |

All three working trees are clean and the cluster work is committed.

### Proven, not just tested

Two independent proofs now stand, and the second subsumes the first.

**Compose, 2026-08-24.** A transfer reached **COMMITTED** through the full chain — Postman →
web-outbound → Mojaloop hub (ALS, quoting-service, ml-api-adapter) → web-inbound → NATS → Java
connector → DFSP backend — with the payer tenant at `jws_sign_enabled=1` and
`jws_verify_mode=require`.

**Kubernetes, 2026-08-27.** The same three-call flow reached **COMPLETED** with web-outbound,
web-inbound and the Java connector running as pods. The two signers authenticated to Vault with their
own **Kubernetes ServiceAccounts** — no development token anywhere; web-inbound ran
`KEY_PROVIDER=database` with no Vault role at all, since it only verifies (`architecture.md` §8).
`wallet1 → wallet2`, USD 10, DemoWallet balance 12767.94 → 12777.94.

Both signers signed live, from Vault-sourced keys:

| Signer | Evidence |
| --- | --- |
| **web-outbound** (axios) | `fspiop-signature` on `POST /quotes` and `POST /transfers`, with matching `fspiop-uri` and `fspiop-http-method` headers |
| **Java connector** (`user-agent: okhttp/4.10.0`) | quoting-service logged an inbound `PUT /quotes/{id}` from `wallet2` **carrying `fspiop-signature`** — leg #3 confirmed at the Hub, not from our own logs |

`GET /parties` went out **unsigned**, as commit 12 requires: a detached JWS has no body to sign.

### Pending actions

1. **Tag `v0.0.25` on `pivotal-connector`.** *The one action that blocks deployment.* Verified
   2026-08-30: the newest tag is **`v0.0.24`**, so 0.0.25 exists only in the local Maven repository.
   The connectors resolve `mod-pivotal-connector-api` from GitHub Packages, so **no connector build
   off this machine can succeed**. `pivotal-thitsawallet-connector/Dockerfile.local` exists only to
   work around this and should be deleted once the publish workflow has run. **This got more
   expensive on 2026-09-02:** the connector's entire mTLS client path now lives in that untagged
   artifact, so no deployment can consume it. The client-owned `gin-*` connectors also need five
   lines added to their own `docker-entrypoint.sh` before they can enable mTLS — they inherit the
   component through package scanning, but not the environment mapping that configures it.
2. **Reissue `web-outbound-hub-client-tls` as PKCS#8.** cert-manager writes PKCS#1 unless told
   otherwise. Node reads both, so this is harmless today — but it is the same encoding that stopped
   the Java connector dead at startup, waiting for whoever next points a JVM at that Secret. One
   field, `privateKey.encoding: PKCS8`, plus deleting the Secret so cert-manager reissues; an
   encoding change alone does not trigger re-issuance.
3. **Production CA ceremony.** *Blocks go-live.* Both trust domains are rooted in **rehearsal**
   KMS keys in a trial account, named `-rehearsal`. No production root exists. The runbook is
   written and the ceremony has been executed twice, so this is scheduling rather than discovery —
   but the `kms:Sign` CloudTrail alarm should be proven to fire before the real one runs.
4. **Re-run `setup-vault-pki.sh` in every provisioned environment.** The `use_csr_common_name=false`
   fix of 2026-09-03 exists only in the local cluster. Anywhere provisioned from the earlier script
   still lets a DFSP choose the name on its own certificate, which defeats the binding rule. Any
   certificate issued from a mis-configured role should be treated as suspect.
5. **`.gitignore` for `pivotal-thitsawallet-connector`.** Still open, and now demonstrated: a single
   `mvn package` during cluster bring-up produced binary diffs on tracked `target/` artifacts
   including `app.jar`. **35 files under `target/` are tracked** as of 2026-08-30.
6. **Schedule the rehearsal KMS keys for deletion.** They bill until they are.
7. **Re-register the local participant callback endpoints.** Both point at
   `http://host.docker.internal:3201`, which was web-inbound's address when it ran as a host
   process. It now runs in k3d, so the callbacks only work while a `kubectl port-forward
   --address 0.0.0.0` is alive. Local-only, but it silently breaks every transfer when the forward
   dies.

### What to do next

JWS and key custody are done. The remaining work is scoped by which deployment ships first — see
*Build order*.

1. ~~**Vault Kubernetes auth**~~ — **done 2026-08-27**, both languages, with per-tenant isolation
   verified. See *Cluster bring-up* in the change log.
2. ~~**cert-manager**~~ — **done 2026-08-30.** Installed, both ClusterIssuers Ready, a leaf issued
   from `pki_hub_client` and scheduled to renew at 60 of its 90 days with no MCM interaction. Built
   from the reference at
   `prod-hub-guinea-gitops/apps/vault-pki-setup/certman-rbac.yaml`: ServiceAccount, the
   `serviceaccounts/token` RBAC Role, a `KubernetesAuthEngineRole`, and a `ClusterIssuer` that
   already uses `pki-hub/sign/...` — note **`sign`**, the correction §5 of
   [`pki-issuance-flows.md`](./pki-issuance-flows.md) says the leg doc still gets wrong.
3. **CA ceremony** — KMS roots for `pki_hub_client` and `pki_dfsp`, Vault PKI intermediates. Runbook
   written, not yet executed. Note production already runs a `pki-hub` mount, so this adds two new
   trust domains beside a pattern that works rather than inventing one.
4. ~~**mTLS on legs #2, #3 and #4**~~ — **code done 2026-09-02.** web-outbound presents a client
   certificate, web-inbound presents the Hub-enrolled server certificate, and the Java connectors
   present their own client certificate; all three reload on renewal without a restart. See the three
   mTLS entries in the change log and
   [`pki-issuance-flows.md`](./pki-issuance-flows.md) §3.3. **What remains is enablement at the Hub
   edge** — terminating TLS and verifying client certificates — which is a deployment change in the
   same organisation, not a design question.
5. ~~**Leg #1** — DFSP-facing CA and enrollment~~ — **code done 2026-09-03/04**, and the only leg
   proven against a real mutual-TLS handshake. What remains is a gateway in the gitops
   repositories, the CA delivery job configured, and one CSR exchange per DFSP.
6. **`pkcs11`** — deferred to the HSM-backed delivery.

**Enough of trust-manager to survive handover.** Manual key provisioning is tolerable while the
people who built the system operate it. Certificate *renewal* is not — certificates expire on their
own schedule regardless of who remembers. cert-manager covers leaf renewal, which is why step 1 must
be real automation rather than a manual issuance. CA registration is closer to one-time, so the rest
of trust-manager can stay deferred.

**The gap this section used to name is closed.** Vault Kubernetes auth was unverified in both
languages — the TypeScript client had only ever used the development token path, and the Java
client's Kubernetes code had never executed. Both now run against a real API server, so the
development-only token shim is no longer on any path to production.

**Local development notes.** SoftHSM2 in the stack, `implementation-plan.md` §1.4, and a refreshed
`runbooks/ceremony-local.md` remain outstanding; the runbook predates the profile rename. SoftHSM2
follows `pkcs11` in priority.


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
| 1 | 🟡 works; accessKey custody unchanged (DFSP-held) | 🟢 **issuance + binding, proven over a real handshake**; off until each DFSP enrolls | **code done** |
| 2 | 🟢 **conformant + per-participant** | 🟡 **code complete + reload**; off until the Hub accepts TLS | **code done** |
| 3 | 🟢 **JWS complete** — signer, vectors, callback wiring, Vault key access | 🟡 **code complete + reload**; off until the Hub accepts TLS | **code done** |
| 4 | 🟢 **verify + cross-checks + tri-state** | 🟡 **code complete + reload**; off until the Hub presents a client certificate | **code done** |
| 5 | — | ⚪ out of scope (but see note) | **excluded** |

🟢 done · 🟡 partial · 🔴 not started · ⚪ out of scope

**The remaining item on #2, #3 and #4 is enablement, not code.** JWS on those three is conformant,
per-participant, running from Vault-held keys under Kubernetes ServiceAccount auth, and confirmed
against a live Hub (see *Proven, not just tested*). The mTLS paths are written and exercised against
real handshakes, including certificate reload, but every one of them is switched off: the Hub in the
local stack speaks plain HTTP and holds no client certificate, so turning any of them on would only
break a working loop. Enabling them is coordinated with the Hub edge, and is the one thing standing
between "code done" and "leg done".

The paragraph that used to sit here said the JWS mechanism was "simply disabled and produces a
protected header Mojaloop will not accept". That was true through commit 1 and is kept only to
explain why #2/#4 were *correction* work rather than greenfield.

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
- **The DFSP-facing CA, issuance and enforcement — built 2026-09-03/04.** `participant_cert` with a
  seeded status lookup table, `DfspCertificateIssuer` signing through `pki_dfsp/sign/dfsp-client`,
  four hub-operator routes behind three HUB-scoped permissions, the portal certificates screen, and
  the request-time binding check in web-outbound.
- **Proven end to end over real mutual TLS**, through an Istio gateway with `mode: MUTUAL`: a
  send-money reached the payee lookup and returned the resolved party. Every rejection path was
  exercised against real certificates — see the change log.

### Left

- **The flag is all-or-nothing per deployment, and decision 7 says it should not be. Planned fix
  below.** `DfspCertificateGuard` returns immediately when `DFSP_FACING_MTLS` is off, so with the
  flag off nobody is checked even when they present a valid certificate, and with it on every caller
  must present one. Two consequences:
  - **A mixed scheme cannot be served.** Where one DFSP's country accepts VPN alone while others
    require mutual TLS, today they cannot share a web-outbound: turning the flag on rejects the
    VPN-only participant, leaving it off means the others are unverified.
  - **Migration by parallel endpoint does not actually work yet**, despite being the stated
    mechanism. Both endpoints route to the same service and the same guard, so the flag flips for
    everyone at once — the flag day the parallel endpoint exists to avoid.

  **The fix, which restores the recorded design.** Decision 7 already specifies it: the certificate
  checks key on **XFCC presence per request**, and `DFSP_FACING_MTLS` only decides whether XFCC is
  *mandatory*. Concretely, in `dfsp-certificate.guard.ts`:

  | XFCC | Flag off | Flag on |
  | --- | --- | --- |
  | present | verify fully — status, validity, `fsp_id` ↔ `FSPIOP-Source` | verify fully |
  | absent | admit | reject |

  A participant that has enrolled is then verified from its first request, whichever endpoint it
  used, while one that has not keeps working. The flag stops being a switch and becomes a statement
  that migration is complete. A few lines and a handful of tests; the guard already has every input
  it needs.

  **One caveat to record with it.** With the flag off, an unenrolled participant is protected by VPN
  alone, so the plain endpoint must not be reachable from outside that VPN — otherwise it is a
  bypass for the enrolled participants too, who could simply stop presenting a certificate. That is
  a network control, not an application one, and it belongs in the deployment's ingress rules.
- Each DFSP still has to enroll — one CSR exchange per participant, operator-mediated.
- **The gateway is not in the chart.** The `MUTUAL` Gateway, its VirtualService and
  `forwardClientCertDetails: SANITIZE_SET` belong in `apps/pivotal` in the gitops repositories,
  which carry the Istio templates; the monorepo chart has none. Applied directly in the local
  cluster to prove the path, deliberately not committed anywhere.
- **The CA reaches the gateway by hand today.** `DfspCaPublishScheduler` exists and is tested, but
  its cross-namespace Role is only rendered when `trustManager.dfspCaGateway` is configured, and no
  deployment sets it yet.
- **Certificates never become `expired` on their own.** `findLapsed` exists and nothing calls it.
  This is deliberate rather than missed: validity is evaluated live at request time, so a lapsed
  certificate is refused whether or not a sweep has relabelled the row. The sweep is reporting
  hygiene, and belongs with the phase-7 lifecycle work.
- **`participant_contact` and expiry alerting are absent** (phase 7). With operator-mediated
  renewal the expiry alert is the trigger to *start* a human exchange, so this matters more here
  than it would with self-service.
- **The standalone accessKey registration screen was on the operator-screens list and is not
  built.** The API exists; the portal only exposes it inside onboarding.
- **Enrollment uses `pki/sign`, as it must.** `dfsp-facing-leg.md` §2 still names `pki/issue`,
  which would have Vault generate the keypair and contradicts the leg's central guarantee. The
  implementation ignores the leg doc and follows the correction in `pki-issuance-flows.md` §5; the
  leg doc remains uncorrected.
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

**JWS signing and the mTLS client path are both complete on this leg.** What remains is enablement.

- **mTLS code done 2026-09-02.** web-outbound presents its client certificate through
  `MutualTlsAgent`, reads the certificate and Hub CA from mounted Secrets, reloads on renewal without
  a restart, and refuses to start if mutual TLS is on with nothing configured
  (`pki-issuance-flows.md` §3.3).
- **Not switched on, and not yet exercised against the Hub.** The Hub endpoints are `http://` in the
  local stack, so axios never reaches for the agent. This needs a TLS-terminating Hub endpoint that
  verifies client certificates.
- Key custody: **resolved in commit 6**, and the Kubernetes half proven 2026-08-27.
  `KEY_PROVIDER=vault-kv` reads each signing tenant's key from `secret/pivotal/jwskey/<fspId>` over
  Kubernetes ServiceAccount auth. The plaintext-MySQL path survives as `KEY_PROVIDER=database`,
  explicitly labelled legacy, so the change is not breaking.
- **Schema prerequisites** (**S2**) — *done in commit 2*: `V3__create_participant_key_table.sql`
  creates `participant_key` with `role = self | peer`, migrates existing identities, and seeds the
  `hub` peer row.
- Rollout state: `FSPIOP_USE_JWS` is still `false` in the Compose defaults
  (`docker/.env.example:51`, `docker/docker-compose.yml:8`); the k3d overlay
  (`helm/values-local-k3d.yaml`) sets it `true`. Per-participant `jws_sign_enabled` is what actually
  gates signing, so the deployment default is a floor, not a switch.

---

## Leg #3 — connector → Hub

**Duty:** sign FSPIOP `PUT`/`PATCH` callbacks as the connector's own tenant.

The connectors PUT **directly to Hub services** — confirmed against a production gitops values file,
where `FSPIOP_PARTIES_URL`, `FSPIOP_QUOTES_URL` and `FSPIOP_TRANSFERS_URL` resolve to
`moja-account-lookup-service`, `moja-quoting-service` and `moja-ml-api-adapter-service`. This is a
real hub-facing leg, not a call into web-outbound.

### Finished

- **The Java signer.** *Commit 3, 2026-08-24, branch `MOJ-1211/hub-facing-jws`.*
  `mod_component/…/component/fspiop/jws/` — `FspiopUri`, `FspiopProtectedHeader`, `FspiopSignature`.
  Detached JWS on `java.security.Signature` (`SHA256withRSA`); **no new Maven dependency**.
- **The shared vectors execute here too.** `fspiop-jws-vectors.json` copied into
  `mod_component/src/test/resources/`, byte-identical to the monorepo copy (same SHA-256).
- **Cross-language interop proven**, not merely assumed — see below.

### Left

**JWS on this leg is done** — commits 3 and 4 built the signer, the Vault key provider and the
interceptor, and 2026-08-27 confirmed it against a real Hub: quoting-service logged an inbound
`PUT /quotes/{id}` from `wallet2` carrying `fspiop-signature`, `user-agent: okhttp/4.10.0`.

Two rows of the original change surface turned out to be unnecessary and are recorded so nobody
rebuilds them: `FspiopCallbackService`'s six `putX` methods **did not** need path-splitting
(`FspiopUri.extract` already strips scheme, host and base path from the outgoing OkHttp URL), and the
`keyRef`/HSM-credential settings belong to `pkcs11`, which is deferred.

**mTLS on #3 is also done, as of 2026-09-02.** `ReloadableMutualTls` builds the socket factory and
`FspiopMutualTls` applies it to the derived OkHttp client, reloading on renewal. The planned reuse of
`RetrofitServiceBuilder.withMutualTLS()` was **not** taken: it carries `hostnameVerifier -> true`,
and lifting a helper out of it would have invited that back. A purpose-built path avoided the
question entirely.

What remains on #3:

| Where | Change |
| --- | --- |
| deployable connector repos | Five lines in each `docker-entrypoint.sh` mapping the new environment variables to system properties. Done for `pivotal-thitsawallet-connector`; the client-owned `gin-*` connectors need it from their owners before they can enable mutual TLS. They inherit the component itself through package scanning. |
| `pivotal-connector` | **Tag `v0.0.25`.** The entire mTLS client path sits in an artifact no deployment can resolve. |
| `mod_component/…/fspiop/jws/` | `KeyProvider`: add the `pkcs11` implementation alongside `vault-kv`. HSM-backed profile only, deferred |

### Blockers specific to this leg

- **`sharedOkHttpClient` is overridden by every deployable** — each connector repository defines its
  own, so anything attached to the library's `OkHttpClient` bean is dead in production. *Solved for
  JWS in commit 4*: `FspiopCallbackService` derives its own client with
  `http.newBuilder().addInterceptor(...)`, which shares the connection pool and dispatcher. **Resolved
  the same way for mTLS on 2026-09-02**: `FspiopMutualTls.apply()` sets the `SSLSocketFactory` on that
  same derived builder, so one `newBuilder()` now carries both the signature and the certificate.
- **Config plumbing is manual and fails closed.** `docker-entrypoint.sh` runs `set -eu` with no
  defaults, so every new property needs an entry in the entrypoint *and* the Dockerfile `ENV` block
  *and* the README table, in **each** connector repo, or the container exits on an unbound variable.
  The mTLS variables are written with `${VAR:-default}` so an unset one cannot halt a container, but
  the per-repo duplication stands — and it is precisely why the client-owned connectors cannot enable
  mutual TLS until their owners make that edit.
- **`Settings.prop()` is weakened in the deployables.** `PivotalConfiguration.Settings` shadows seven
  parent fields and reimplements `prop()` as exact-match `System.getProperty` only
  (`PivotalConfiguration.java:96-99`), dropping the parent's env-style and normalized-key fallbacks.
  Fix by extending rather than shadowing, or new settings will silently take defaults. The mTLS
  settings were deliberately left unshadowed for this reason and resolve correctly in the cluster.

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

- JWS verification for this leg is complete, and **server-side mTLS is done as of 2026-09-02**. The
  listener presents the certificate obtained through MCM inbound enrollment and verifies callers
  against the Hub CA, reloading both without a restart.
- **A real defect was found and fixed here**, not merely wired: the listener was built from the
  *client* certificate store, so it would have presented a leaf signed by Pivotal's own CA where the
  Hub expects its own. See the change log entry.
- **Not switched on.** `requestCert` is true when enabled, so every caller must present a
  certificate the Hub CA signed — which the local Hub services do not have. Enabling this is
  coordinated with the Hub edge.
- Guard is not registered globally; per-controller `@UseGuards` coverage needs an audit.

---

## Leg #5 — connector → payee CBS *(out of scope)*

Excluded by `architecture.md` §106: the FSP owns the endpoint and the CA, provisioning is manual, and
Pivotal holds no key material.

One correction to carry into the docs: `architecture.md` §116 asks "whether the connectors verify
those backends' server certificates". **They do not.** Every connector calls
`withDisableSSLVerification()` — an all-trusting `X509TrustManager`, `hostnameVerifier -> true`, and
`SSLContext.getInstance("SSL")`. The current state is *unverified*, not *manually verified*. Worth a sentence in
`architecture.md`; not trust-manager work.

---

## Cross-cutting

Three rows here were stale and contradicted the rest of this file; corrected 2026-08-27.

| Item | Status | Note |
| --- | --- | --- |
| Protected-header contract + conformance vectors | 🟢 | Commit 1. Vectors are byte-identical across repos (same SHA-256); 90 tests pass in `shared-fspiop` |
| Key custody — `vault-kv` provider | 🟢 | Done both sides: Java commit 4, TypeScript commit 6 |
| **Vault Kubernetes auth — both languages** | 🟢 | **Proven 2026-08-27 in k3d.** Was the last unverified assumption under shipped work |
| **Per-tenant Vault path isolation** | 🟢 | `connector-wallet2` reads its own key, **denied wallet1 and cofinagn (403)**; web-outbound reads all three |
| **ServiceAccounts in the helm chart** | 🟢 | Chart had **none** — all 9 pods ran as `default`, which makes per-tenant scoping impossible. Uncommitted |
| Key custody — `pkcs11` provider | 🔴 | HSM-backed profile only; deferred |
| Regenerate `participant.jws_private_key` | 🟡 | `wallet1` regenerated and Vault-only. `wallet2`/`cofinagn` still hold plaintext PEM in the column — **legacy rows, unsupported per S9**, to be cleared by a migration script rather than carried forward. The column is retained deliberately |
| **cert-manager** | 🟢 | **Done 2026-08-30.** Installed, two ClusterIssuers Ready against Vault over Kubernetes auth; a leaf issued and scheduled to auto-renew |
| `pki_dfsp` CA (leg #1) | 🟢 | **Rooted in AWS KMS 2026-09-02.** Root signs the Vault intermediate via `kms:Sign`; role `dfsp-client`; root CRL signed and verified. Rehearsal keys — production roots still to create |
| `pki_hub_client` CA (legs #2, #3) | 🟢 | **Rooted in AWS KMS 2026-09-02.** Same shape via `kms:Sign`; leaf chains to it and MCM holds it for every tenant. Rehearsal keys — production roots still to create |
| MCM registration of the Pivotal CA | 🟢 | **Automated 2026-09-02** — trust-manager reconciles the CA across all `self` tenants each tick, reading MCM back rather than keeping a mirror. Found real drift on first run |
| MCM inbound enrollment (leg #4 server cert) | 🟢 | **Done 2026-09-02** — trust-manager enrols and renews it; verified chaining to the Hub CA with a matching private key |
| **Hub CA trust-bundle delivery** | 🟢 | **Resolved 2026-09-02.** Authoritative in Secret `hub-ca-bundle`; `hub_trust` demoted to a mirror. Mounted and read by web-outbound, web-inbound and the connector |
| Local dev environment | 🟢 | k3d + Vault + cert-manager + **SoftHSM2** all in place, each with a re-runnable script. `runbooks/ceremony-local.md` is now implemented by `scripts/ceremony-local.sh` — the runbook prose is still pre-rename and single-domain, but the script supersedes it |
| `NatsPullListener` ack-after-PUT | 🔴 | **Re-confirmed 2026-08-27**: `handle()` still acks in `finally` even on failure (`NatsPullListener.java:162`), logging *"failed - acking to avoid requeue"*, so `maxDeliver=5` never retries. `hub-facing-leg.md` §244 wants this changed. Same file for all four listeners |

### Connector scope

Two Java repositories are in scope:

| Repo | Role | Version |
| --- | --- | --- |
| `pivotal-connector` | the shared library — all Mojaloop protocol handling | publishes **0.0.25** |
| `pivotal-thitsawallet-connector` | the standard deployable, copied to create new DFSP connectors | 0.0.24 → **0.0.25** |

0.0.25 also carries the audit-key fix from v0.0.18, which restored `payerFsp`/`payeeFsp` in
PATCH-error audit messages after a rename had broken the Pivotal consumer.

---

## Build order

**This diagram is the authority on sequence, and it renumbers**
[`implementation-plan.md`](./implementation-plan.md) §5, so the two do not line up. That
document's *phase 4* (MCM registry sync) is **5c** here, and its *phase 5* (Hub-facing mTLS)
is **step 6**. Read the phases there for what each contains; read this for when.

**Reordered 2026-08-25 by delivery date.** The KMS-backed deployment ships first; the HSM-backed one
has roughly a month more. `pkcs11` serves only the HSM-backed profile, so it leaves the critical path
entirely — building it now would spend the schedule on the deployment that is not waiting.

```
  DONE  ┌─────────────────────────────────────────┐
    1   │ protected-header contract + vectors     │  monorepo
        │ #2 sign · #4 verify · conformance loop  │
        └────────────────────┬────────────────────┘
  DONE  ┌────────────────────▼────────────────────┐
    2   │ #3 — Java signer against those vectors  │  pivotal-connector
        └────────────────────┬────────────────────┘
  DONE  ┌────────────────────▼────────────────────┐
    3   │ key custody — vault-kv, both languages  │  proven end to end
        └────────────────────┬────────────────────┘
  DONE  ┌────────────────────▼────────────────────┐
   4a   │ cluster: Vault Kubernetes auth      DONE │  proven both languages,
        │                                         │  per-tenant isolation verified
        └────────────────────┬────────────────────┘
  DONE  ┌────────────────────▼────────────────────┐
   4b   │ cluster: cert-manager + Vault PKI   DONE │  both trust domains up,
        │                                         │  leaf issued + auto-renewing
        └────────────────────┬────────────────────┘
  DONE  ┌────────────────────▼────────────────────┐
   5a   │ CA ceremony rehearsal — SoftHSM2    DONE │  no cloud needed
        └────────────────────┬────────────────────┘
  DONE  ┌────────────────────▼────────────────────┐
   5c   │ MCM registry sync                  DONE │  mcm-client plus four
        │ peers · hub CA · CA reg · own keys ·    │  trust-manager jobs,
        │ server-cert enrollment                  │  all proven in-cluster
        └────────────────────┬────────────────────┘
  DONE  ┌────────────────────▼────────────────────┐
   5b   │ CA ceremony — KMS roots            DONE │  rehearsal keys; prod
        │                                         │  roots still to create
        └────────────────────┬────────────────────┘
  DONE  ┌────────────────────▼────────────────────┐
    6   │ mTLS across #2, #3, #4              CODE │  client, server and Java
        │ present · verify · reload on renewal    │  paths all reload;
        │                                         │  OFF until the Hub edge
        └────────────────────┬────────────────────┘
  DONE  ┌────────────────────▼────────────────────┐
    7   │ #1 DFSP-facing mTLS + enrollment    CODE │  schema · issuance ·
        │ operator screens · binding · CA to gw   │  screens · binding;
        │                                         │  proven over real mTLS
        └────────────────────┬────────────────────┘
  NEXT  ┌────────────────────▼────────────────────┐
    9   │ production CA ceremony — real KMS roots │  rehearsal roots only;
        │ then enable each leg at its edge        │  blocks go-live
        └────────────────────┬────────────────────┘
        ┌────────────────────▼────────────────────┐
    8   │ pkcs11 — HSM-backed profile             │  deferred, both repos
        └─────────────────────────────────────────┘
```

**Why steps 1–3 came first.** #2 and #4 form a closed loop — web-inbound already verifies Pivotal's
own tenants (`architecture.md` §2), so signing and verification were testable inside Pivotal with no
Hub, no CA and no HSM. That also pinned the protected-header contract before anyone built against it.

**Why mTLS follows rather than accompanies JWS.** JWS is application-level and flips per participant;
mTLS is a hard cutover on a shared listener. Entangling them would make both un-rollbackable. This
is also why step 6 is marked **CODE** rather than DONE: writing the paths and turning them on are
separable, and only the first half is finished.

**Why the cluster comes before the ceremony.** cert-manager issues the leaves and Vault Kubernetes
auth is the production credential path. The second half of that reasoning is now spent: Kubernetes
auth **has** executed, in both languages, and the assumption it was carrying is discharged. What
remains of step 4 is cert-manager, which is a prerequisite for certificates rather than a risk to
retire.

**What deferring `pkcs11` costs.** `implementation-plan.md` §5 phase 1 argued for building both
signers together, so that two implementations against one interface would prove the interface had not
absorbed HSM assumptions. Deferring means the `KeyProvider` seam is validated by `vault-kv` alone and
may quietly have taken on its shape. That is a real risk accepted for delivery, not an oversight —
expect some interface rework when `pkcs11` lands.


---

## Decisions taken for legs #2 and #4

Settled 2026-08-23. These scope the first build step; they do **not** revisit the design register in
[`README.md`](../README.md).

| # | Decision | Reasoning |
| --- | --- | --- |
| **S1** | **Build against the existing `participant.jws_private_key` column, behind a `KeyProvider` interface.** | No JWS runs in production on any leg, so the column has never held a key used for a real transaction. Decision **D21** (regenerate, never migrate) is therefore a **non-event** here — nothing to compromise, nothing to rotate. Keeps #2/#4 infra-free; `vault-kv` and `pkcs11` slot in behind the same interface, which is also what #3 needs. **Superseded: retired by commit 6, and refined by S9 — the column is now a legacy read path only, and D21 is no longer a non-event because real keys have since been written to it.** |
| **S2** | **Signing is enabled per participant; verification is the tri-state already specified in `architecture.md` §6.2.** | Corrected — see below. An earlier draft of this file proposed two booleans on `participant`; that contradicted the design on both counts. |
| **S3** | **No `@mojaloop/sdk-standard-components` dependency.** Own implementation, structures referenced from the source quoted in `hub-facing-leg.md` §A2. | Explicit instruction. Consistent with `hub-facing-leg.md` §A6, which already calls for shared vectors executed by both languages in CI. |
| **S5** | **`FSPIOP-URI` extraction mirrors the reference: throw on an unrecognised resource name, never degrade to the raw path.** | A degraded URI is signed and sent successfully today, because no peer verifies yet. It surfaces months later, in production, as "a peer broke us" — a signature mismatch several layers from the cause. Throwing turns that into a CI stack trace on the line that built the request. Accepted cost: the resource list must be maintained, and a new FSPIOP resource breaks signing rather than degrading. A request we cannot sign correctly is one we should not send. |
| **S6** | **Bodyless requests are not signed, and a signature on one is rejected.** | Verified against `@mojaloop/sdk-standard-components`: `baseRequests._get` carries no signing call, `baseRequests.js:219` states *"config.jwsSign is ignored here, as we don't JWS sign requests with no body"*, and `jwsSigner.sign` throws `'Cannot sign with no body'`. Pivotal's earlier `{"date":…}` substitute was an invention no peer could reconstruct — a signature that looks like protection and verifies nowhere. Reverses the convention preserved in commit 1. |
| **S7** | **`PUT /parties` is always signed, and always verified. No `jwsSignPutParties` equivalent.** | The reference gates PUT-parties signing on a separate flag (`baseRequests.js:290`), defaulting to `jwsSign` but independently disablable. Pivotal does not reproduce that opt-out on its own traffic. The **peer**-side quirk remains real and is absorbed by the inbound tri-state — see the rollout hazard below. |
| **S8** | **A connector reads one tenant's key from Vault over k8s ServiceAccount auth and signs in-process. It never delegates signing, and never touches MySQL.** | Closes open questions 1 and 2. Amends **D4**, which held only in the HSM-backed profile — see below. |
| **S4** | **No Hub-registered keypair exists**, so throwaway RSA-2048 keys are generated for the test loop. | Closes the #2↔#4 loop locally. See *Residual risk* for why a Hub round-trip would not have helped anyway. |
| **S9** | **The plaintext keys in `participant.jws_private_key` are a previous design mistake and are not supported. The column stays.** | *Owner decision, 2026-08-30.* Every value ever written to that column is plaintext PEM and must be treated as compromised (**D21**), so no existing tenant's key is carried forward — `wallet2` and `cofinagn` are **not** migrated, they are regenerated like any other. The **column itself is retained**, because a migration script has to be able to find and clear the keys it is retiring; a dropped column leaves nothing to migrate *from*. `KEY_PROVIDER=database` therefore survives as a read path for legacy rows, not as a supported mode for new ones. |

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

### DFSP-facing enforcement, proven over a real handshake · 2026-09-04

The binding check, the gateway credential job, and the first transaction to complete over mutual TLS.

**What the check does.** A request is refused unless the certificate the gateway verified and the
`FSPIOP-Source` header name the same DFSP. The fingerprint from `x-forwarded-client-cert` resolves
a `participant_cert` row, and the row's `fsp_id` is compared with the header. Registered ahead of
`AccessGuard`: transport identity before message identity, so a request that cannot be attributed
at all is rejected before any key lookup.

**Read per request, not from a cache.** One indexed lookup on a unique key. That is what let phase 2
stay deferred: revocation takes effect immediately rather than when a cache turns over, and validity
is evaluated against the clock rather than trusted from `status`, so a lapsed certificate is refused
without any sweep having run. Confirmed live — a certificate revoked and queried in the same second
was rejected.

**Proven against Istio rather than a stand-in.** Istio was installed locally for this, because the
one assumption worth testing could not be tested any other way:

| Sent | Result |
| --- | --- |
| No client certificate | refused at TLS; never reaches the application |
| wallet1 certificate, `fspiop-source: wallet1` | admitted |
| wallet1 certificate, `fspiop-source: wallet2` | **401** — the binding rule |
| wallet1 certificate **plus a forged XFCC naming wallet2** | **401** — the forgery was discarded |

The last row is the one that mattered. Envoy's own config dump reports
`"forward_client_cert_details": "SANITIZE_SET"`, so the caller's header was replaced with the
gateway's own. **Until that was proven, every earlier test of this guard had been performed by
forging the header** — which also demonstrated the hazard: with the flag on and no sanitising proxy
in front, anyone who names a fingerprint is accepted. web-outbound now says so loudly at startup,
because nothing in the process can detect that misconfiguration.

It also settles an assumption recorded as unverified: Envoy's `Hash` and `participant_cert.
fingerprint_sha256` agree byte for byte. The lookup resolved, so they must.

**The CA cannot reach the gateway the way the Hub CA does.** Istio reads a gateway's credentials
only from the namespace the gateway runs in, and `KubernetesSecretWriter` could only write its own.
`DfspCaPublishScheduler` now writes across that boundary, under the `cacert` key, assembling
**intermediate followed by root** — the issuing mount's own chain contains only itself, so a bundle
from one alone leaves the gateway unable to build a path. The cross-namespace Role withholds
`create`: the Secret is expected to exist beside the gateway, so a missing one surfaces as a failed
sync rather than as this job minting a trust anchor of its own.

**A live transaction completed**, payee resolved, over mutual TLS end to end. Getting there exposed
that both participants' callbacks are still registered at `http://host.docker.internal:3201` — web-
inbound's address when it ran on the host rather than in the cluster. Unrelated to certificates, and
bridged with a port-forward; the endpoints want re-registering.

**Deploying the portal surfaced three defects in the chart and image, all pre-existing.** The
generated `config.js` was missing a comma and so never parsed, leaving `window.__PIVOTAL_CONFIG__`
unset in *every* deployment using that image; the portal Deployment passed no environment at all, so
the values that generate it were ignored; and it declared port 80 while nginx binds 8080, leaving
the Service with no reachable endpoint. web-pivotal was also asking Vault for signing keys it never
uses — it now runs `KEY_PROVIDER=database` and holds a certificate-issuing role only.

### DFSP certificate issuance, and a CA that let callers name themselves · 2026-09-03

Schema, issuance, the hub-operator API and the portal screen — the half of the DFSP-facing leg that
creates certificates.

`participant_cert` carries the fingerprint as the runtime lookup key, with status in a seeded lookup
table rather than an application enum. The row is the only record a certificate exists: the issuing
role runs `no_store=true`, so a purged row does not disable a certificate, it makes it
unaccountable. Rows are retired by status and never deleted before `valid_to` passes.

**The finding.** With the CA reachable, an enrollment was run using a request whose subject
deliberately claimed a different tenant. It came back **signed with that name**. Vault's PKI `sign`
endpoint defaults to `use_csr_common_name=true`, so it takes the subject from the submitted request
and ignores the `common_name` supplied by the caller.

That defeats the binding rule outright — a DFSP could have obtained a certificate for any tenant.
Every unit test had passed throughout, because the fake certificate authority implemented the
behaviour that was *intended* rather than the one Vault has. The mock encoded the assumption, so it
could never have caught it.

Fixed in two places on purpose: the issuing role now sets `use_csr_common_name=false use_csr_sans=
false`, and issuance verifies the returned common name against the enrolled participant and records
nothing if they differ. A role left at its default can no longer produce a mis-bound certificate
silently. A regression test now reproduces Vault's real default.

**Also worth knowing:** cert-manager and Vault both write PKCS#1 private keys unless told
otherwise, and an encoding change alone does not trigger re-issuance — the Secret keeps its original
key until deleted.

### Connector mutual TLS — the hub-facing leg closed · 2026-09-02

The last of the three hub-facing paths, and the only one starting from nothing:
`sharedOkHttpClient()` set timeouts and no more — no socket factory, no trust manager, no client
certificate.

**Where it had to go.** Not on the shared client. Every deployable connector overrides that bean
with its own, so anything configured there reaches part of the fleet. The JWS signer already solved
this by installing itself on a *derived* client inside `FspiopCallbackService`; mutual TLS now does
the same, from a component in the scanned package that every deployable picks up without changing.
The client-owned connectors inherit it for free.

**Reload, in a language with no equivalent of swapping a context.** The socket factory is built once
and never replaced; behind it sit key and trust managers that delegate to a swappable reference. The
JSSE resolves those per handshake, so a rotation reaches new connections while established ones drain
— and the OkHttp client, its pool and its dispatcher survive untouched.

**Two findings the fail-fast produced immediately.**

- **cert-manager issues PKCS#1 private keys by default, and the JDK cannot read them.** The connector
  refused to start with exactly that message. OpenSSL-based stacks read both encodings, which is why
  this surfaced only on the Java leg and only once a real certificate was mounted. Fixed at issuance
  with `privateKey.encoding: PKCS8` — the alternative was a second PEM parser inside an artifact four
  connectors inherit, for a difference that carries no meaning.
- **An encoding change alone does not trigger re-issuance.** The Secret keeps its original key until
  deleted.

Seven tests against a real certificate authority and a real TLS server: the certificate is presented,
a renewal reaches the next connection through the same factory, an identical rewrite is a no-op, a
truncated file leaves the previous material serving, and half a pair is refused. BouncyCastle was
added **test-scoped only** to build the authority; the shipped artifact stays free of it.

**Worth recording about the dev loop.** `k3d image import` silently does nothing when the tag already
exists on the node, and the deployable's manifest names a different image than the one
`Dockerfile.local`'s comment builds. Between them, several rebuilds never reached the cluster while
every command reported success. Verify the artifact inside the pod, not the build's exit code.

### Server certificate on web-inbound — a substitution that would have passed review · 2026-09-02

`main.ts` built the listener's TLS options from the **client** certificate store. web-inbound would
have presented a leaf signed by Pivotal's own CA as its server certificate, where the Hub verifies
inbound connections against its own chain.

The enrolled certificate was already there — `hub-server-cert.enroller.ts` obtains it through MCM and
writes it to a Secret — and nothing read it.

**Why this is worse than a plain bug.** A peer that verifies rejects the connection outright. A peer
that does not verify accepts it, and mutual TLS then *appears* to work while authenticating nothing.
Proven by probing the running service: it now presents `CN=web-inbound.pivotal` issued by
`CN=Hub Root CA`, matching the bundle in `hub-ca-bundle`. Before the fix it would have offered the
leaf issued by `CN=Pivotal Hub Client CA Root`.

The two stores are now separate types rather than one reused for both roles, so the substitution
cannot be made silently again. The listener reloads through `setSecureContext`, the server-side
counterpart to the agent's context swap.

Two smaller things went with it: the guard messages read `FSPIOP_USE_MUTUAL_TLS=false requires...` on
a path only reached when it was **true**, and the `as any` on the Nest options is now a narrow cast —
Node's server options are genuinely wider than the shape Nest declares, differing only in the
nullability of an SNI callback argument this code never sets.

**A test finding worth keeping.** The first assertion that an uncertificated caller is rejected
failed, and the code was right: under TLS 1.3 the client certificate is sent *after* the server's
Finished, so the rejection surfaces on first read rather than at connect. That is also where
operators will see it in the field.

### Client certificate on web-outbound, and certificate reload · 2026-09-02

The first of the three. The stores existed but read inline environment variables and built an
`https.Agent` once, so cert-manager's 60–90 day renewal would have done nothing until a restart.

Reload was deliberately deferred earlier as a separate concern. It stopped being separable here:
turning mutual TLS on is what makes an unrenewed certificate an outage rather than an inconvenience,
so it shipped alongside rather than after.

**The seam.** One agent whose `secureContext` is swapped. Node reads that option per new connection,
so new connections take the new material and pooled ones finish on the old — the overlap both
certificates are valid for. The material is fingerprinted rather than compared by timestamp, because
a Secret update rewrites the file whether or not the bytes changed; reload failures are logged and
swallowed, because a Secret is briefly half-written mid-update.

The service now **refuses to start** when mutual TLS is on and no material is configured. Previously
that combination would have sent requests with no client certificate and failed at the peer as an
opaque handshake error, far from the cause.

**A chart defect this exposed.** `apps.yaml` emitted the shared environment blocks *after* each
component's own, so no service could override a shared value — which makes per-service rollout
impossible, and per-service rollout is the entire model here. The first fix relied on "last duplicate
wins" and was wrong: server-side apply rejects duplicate environment keys outright, and the upgrade
failed with `duplicate entries for key [name="FSPIOP_USE_MUTUAL_TLS"]`. The template now merges the
maps, so a component value overrides and one entry is emitted. Verified across all eight deployments.

**Not proven end-to-end.** The local Hub URLs are `http://`, so axios never reaches for the agent.
Real Hub verification waits on a TLS-terminating Hub endpoint.

### Enrollment model settled — operator-mediated · 2026-09-02

Owner decision. The last blocking item in the register is closed, and with it the last
thing preventing the DFSP-facing document from going to a DFSP.

**A DFSP sends its CSR and any new accessKey to the hub operator**, who uploads them
and returns the signed certificate and chain. Self-service through the portal is a
later, separable phase.

The argument is the one the decision opened with: self-service makes a portal login the
root of trust for cryptographic identity, and DFSP-scoped IAM does not exist to carry
that. The cost of deferring is one operator step per DFSP at enrollment and at renewal
— low volume — and it removes the larger half of the DFSP-facing phase.

Resolves **K** and **F** together, which were always the same authorization question.
`participant.access-key.update` stays `HUB`-scoped.

**What this sizes.** The DFSP-facing phase now needs hub-operator screens only — CSR
upload, certificate and chain download, certificate status, accessKey registration,
contact management — on top of the IAM that already exists. No DFSP-scoped IAM, no
step-up authentication.

**Two corrections to the external document, which can now go out:**

- The hedge is gone. It said *"through the portal, or to the hub operator where
  enrollment is operator-mediated"*, which told a DFSP nothing about what to actually do.
- It claimed the FSPIOP signing key lives in a hardware security module. That describes
  a profile this deployment is not running — the key is in a secrets manager, read into
  process memory at startup. Sending that sentence to a DFSP would have overstated the
  assurance level. It now names both possibilities and says to confirm which applies.

**One consequence worth telling DFSPs plainly:** renewal now involves a human exchange,
so the expiry alert is the trigger to *start*, not the deadline. Added to the document.

### CA ceremony against real AWS KMS keys — 5b · 2026-09-02

Both trust domains are now rooted in AWS KMS. The rehearsal keys sit in a trial
account and are named `-rehearsal`; production roots must be created on the
production account, with a witness, and are unrepeatable.

| File | Change |
| --- | --- |
| `pivotal/scripts/ceremony-kms.js` | **new** — the ceremony, `kms:Sign` in place of PKCS#11 |
| `.../component/mcm-ca-registration.scheduler.ts` | reads the CA from a mounted file, not from Vault |
| `packages/apps/trust-manager/*` | `PIVOTAL_CA_PATH` replaces `PIVOTAL_CA_URL` |

**Only one step differs from the SoftHSM rehearsal.** KMS is not a certificate
authority: it signs a digest and nothing else. The script builds the X.509 itself, so
steps 1, 2, 3 and 5 are byte-identical across backends and only the signing call
changes — `kms:Sign` here, `C_Sign` there. That is what made the local rehearsal
faithful, and it is why Vault needs no KMS integration of any kind.

**Verified end to end:**

| Check | |
| --- | --- |
| root self-signed by KMS | both domains, `openssl verify` OK |
| intermediate signed by the root | chains OK, installed into Vault |
| root CRL signed by KMS | both domains, signature verifies against the root |
| cert-manager leaf → intermediate → KMS root | OK |
| negative control — leaf vs the *other* domain's root | fails, as it must |
| MCM | all three tenants hold the KMS-rooted CA |

**Drift and convergence worked without intervention.** Replacing the roots invalidated
the issued leaf and the registration MCM held. cert-manager reissued; the CA reconcile
job noticed and re-registered on its next tick — `3 registered, 0 failed`. That is the
behaviour the converge-toward-intent design exists to produce, and it is worth having
seen before a real ceremony.

#### A gap this exposed, and it was silent

`pivotalCaUrl()` read Pivotal's own root from **Vault**. That is only true in a SoftHSM
rehearsal: under KMS or CloudHSM the root is in a key service with no export API and is
**not in Vault at all**. The reconcile job would therefore have registered a stale
certificate with MCM and reported success. Nothing would have failed until a peer
rejected a handshake, months later and far from the cause.

Now `pivotalCaPath()`, reading a file the ceremony publishes into a `pivotal-ca-bundle`
Secret. This works under every backend, and only the certificate ever reaches the
cluster — never the key. Only the **hub-client** root is published; the DFSP-facing root
is downloaded by DFSPs alongside their signed certificate and is not needed in-cluster.

#### The CRL is hand-assembled

`node-forge` has no CRL support, so `buildRootCrl` builds the `TBSCertList` directly,
lifting the issuer and algorithm identifier out of the root's own DER rather than
reconstructing them. Both CRLs verify. It is in the ceremony because revoking an
intermediate needs a root-signed CRL, and that is far easier to write while the tooling
is open than to work out during an incident.

#### What a rehearsal still cannot prove

The rehearsal exercised `kms:Sign`, IAM scoping — `kms:ListKeys` is correctly denied —
and the full chain. It has not exercised a **CloudTrail alarm on `kms:Sign` at a zero
threshold**, which the runbook says to create and test *before* the real ceremony.
Legitimate use is roughly three signatures for the life of a deployment, so any
occurrence is worth an alert.

### Hub server certificate enrollment — the last MCM call · 2026-09-02

Every MCM call the design needs is now exercised. This one yields the certificate the
Hub validates when it calls Pivotal, and it is the only certificate here issued by the
**Hub's** CA rather than Pivotal's — which is why it comes through enrollment rather
than from Vault.

| File | Change |
| --- | --- |
| `packages/core/trust/domain/component/hub-server-cert.enroller.ts` | **new** |
| `packages/core/trust/domain/component/kubernetes-secret-writer.ts` | `read()`, for the expiry check |
| `packages/shared/mcm-client` | `createInboundEnrollment`, `signInboundEnrollment`, DTO |
| `pivotal/.dockerignore` | **new** — see below |
| `package.json` | `node-forge` |

**Verified in-cluster:**

| | |
| --- | --- |
| subject | `CN=web-inbound.pivotal` |
| issuer | `CN=Hub Root CA, O=Hub Organization` — the Hub's CA, not ours |
| chain | `openssl verify` against the Hub CA bundle: **OK** |
| key | 4096-bit, and the stored private key **matches** the certificate |
| EKU | TLS Web Server Authentication |

**MCM requires 4096-bit keys here**, which nothing in the design mentions. A 2048-bit
CSR is still signed and the certificate works, but the enrollment is recorded
`INVALID` on a `CSR_PUBLIC_KEY_LENGTH_4096` check — discarding MCM's validation signal
for no benefit. This does not conflict with RSA-2048 for message signing: that is a
signing key used hundreds of times a second, this is a TLS key generated once a year.

**`node-forge` was added.** Node has no CSR support and the runtime image has no
`openssl`, so a CSR cannot be produced without one of them. A library keeps the
private key in process and out of any file; it is also what MCM itself uses.

**Renewal is by overlap.** A new certificate is obtained 30 days before expiry and
both are valid meanwhile, so nothing needs coordinating with the Hub. Certificate and
key are written to the Secret together — a key written before its certificate leaves a
window where the Secret holds a mismatched pair.

#### A packaging defect that affects every image in this repo

`.dockerignore` was **empty**, so `COPY . .` carried the host's `dist/` into the build,
including `.tsbuildinfo`. TypeScript then trusted that cache and skipped re-emitting
files it believed current — producing an image with `.d.ts` but no `.js` for anything
the host had built and later removed. It surfaced as `Cannot find module` at runtime,
nowhere near its cause, and it would hit any developer whose `dist/` differs from the
build. Now excluded, along with `node_modules` and `.env` files, which were also being
baked into images.

#### Two smaller lessons

- **`docker build -q` hid a compile failure.** The build had been failing on a
  duplicate method name for two rounds while the old image kept being deployed. Do not
  use `-q` when the build is the thing under test.
- **`nest build` reported success on the same broken source**, because it reused a
  cached artifact. The Docker build, starting clean, was the honest signal.

### JWS key publish — phase 4's registry sync complete · 2026-09-02

trust-manager's fourth job. With this, everything MCM needs from Pivotal and
everything Pivotal needs from MCM moves on a timer.

| File | Change |
| --- | --- |
| `packages/core/trust/domain/component/jws-key-publish.scheduler.ts` | **new** |

**The mirror image of the peer pull.** We fetch peers' public keys so inbound traffic
can be verified; peers run the same fetch against MCM, so until our keys are
registered there, every peer that turns on verification rejects everything Pivotal
signs. Only the public half leaves — the private half stays where the signer reads
it, and this is not the DFSP's accessKey, which the DFSP generates and MCM never sees.

**It fills gaps and refuses to resolve disagreements.** The protected header carries
no key identifier and MCM stores exactly one key per tenant, so a verifying peer holds
one key and cannot try both. Publishing where MCM has **nothing** is safe: no peer
holds an older key to break. Replacing a key MCM already holds is not, so the job
warns and leaves it alone. `publish(fspId)` is the operator-driven path that does
replace, for use once the rest of a rotation is sequenced.

**Verified in-cluster, including the guard:**

| | |
| --- | --- |
| gap filled | `1 published, 2 already correct, 0 diverged, 0 failed` |
| divergence planted deliberately | `0 published, 2 already correct, **1 diverged**, 0 failed` — warned, did not overwrite |
| after restoring | silent — all four jobs log only on change |

**It also closed the drift the CA reconciler found.** `cofinagn` existed in Pivotal
but not in MCM. Creating the tenant there let both jobs converge on the same tick —
CA registered, key published — which is the whole point of writing them as
converge-toward-intent loops rather than one-shot actions.

#### Where phase 4 stands

| Job | |
| --- | --- |
| Pull peer JWS keys | done |
| Poll the Hub CA into the trust bundle | done |
| Reconcile MCM CA registration | done |
| Publish own JWS keys | done |

What remains before inbound verification can move to `verify-if-present` in anger is
not a trust-manager job: the Hub itself does not sign today, so Hub-originated errors
arrive unsigned, and each peer starts signing on its own schedule.

### MCM CA registration reconcile · 2026-09-02

trust-manager's third scheduled job, and the last of phase 4's registry-sync work
apart from publishing own keys.

| File | Change |
| --- | --- |
| `packages/core/trust/domain/component/mcm-ca-registration.scheduler.ts` | **new** |
| `packages/shared/mcm-client` | `getDfspCa()` and its DTO, for the read-back |

**No state table.** The plan proposes an `mcm_ca_registration` table for drift
detection; this reads MCM directly each tick instead. MCM is authoritative for what
MCM holds, so a local mirror would only add a second copy to drift against the very
thing it describes. The table stays available for reporting, but nothing depends on
it and no migration is needed.

**The CA comes from Vault PKI's unauthenticated CA endpoint.** A CA certificate is
public, and Vault serves `pki_hub_client_root/ca/pem` without a credential — so
trust-manager needs no Vault authentication for this job at all.

**Verified in-cluster, and it found real drift on the first run:**

```
tick 1   2 registered, 0 already correct, 1 failed, of 3 tenants
tick 2   0 registered, 2 already correct, 1 failed, of 3 tenants
```

Idempotent from the second tick, because the read-back matches. The failure is
genuine and is exactly what this job exists to surface: `cofinagn` is a `self` tenant
in Pivotal that **does not exist in MCM** — `404 DFSP with id cofinagn not found`.
Onboarding to Pivotal and onboarding to MCM are separate acts, and nothing previously
noticed when only one of them had happened.

**One tenant failing does not stop the rest.** A partial reconcile that converges the
others is better than none, and the next tick retries the one that failed.

**Registering is not distributing**, and the log can mislead on this point: MCM stores
what it is told and does not put the certificate into the Hub's ingress trust store.
A Hub operator does that out of band, so this job can report everything registered
while the Hub still rejects the connection.

### Hub CA sync — the delivery loop closed · 2026-09-02

trust-manager's second scheduled job. The `hub-ca-bundle` Secret was already mounted
and read by all three consumers, but written by a script with a placeholder. This
replaces the placeholder with the real certificate from MCM.

| File | Change |
| --- | --- |
| `packages/core/trust/domain/component/hub-ca-sync.scheduler.ts` | **new** — pulls `GET /hub/ca`, writes the Secret when it changes |
| `packages/core/trust/domain/component/kubernetes-secret-writer.ts` | **new** — one Secret, via the pod's ServiceAccount, no client library |
| `helm/templates/trust-manager-rbac.yaml` | **new** — ServiceAccount, Role, RoleBinding |
| `docker/trust-manager.Dockerfile` | **new** |

**Proven in-cluster.** trust-manager ran as a pod, authenticated to MCM, and rewrote
the Secret: `CN=Hub CA (stand-in)` → `CN=Hub Root CA, O=Hub Organization`. All three
consumers now read the real certificate from `/etc/pivotal/hub-ca/hub-ca.pem`, the
connector included. Peer sync ran in the same process: 8 added, 2 own tenants skipped.

**Writes only on change.** One write across ~7 minutes of 60-second ticks. Rewriting
an unchanged Secret bumps its resource version and makes everything watching it
reload for nothing.

**The RBAC is deliberately narrow** — `get` and `patch` on the one named Secret, plus
`create`, which Kubernetes cannot restrict by name because the authorizer does not
know the name until the object exists. Verified: `delete` denied, other Secrets
denied, `list` denied. Whoever can write this bundle can insert their own CA and be
trusted as the Hub, so the grant is scoped to the single object.

#### Three problems found by running it

- **The client was logging bearer tokens.** The shared axios builder attaches an HTTP
  logger that writes response bodies, and the token endpoint's response body is an
  access token — so every refresh wrote a usable credential to the log. The token
  provider now builds a bare client. Verified: zero `access_token` strings in the log.
- **A valid token MCM will not accept.** Fetching it from `http://keycloak:8080`
  produced an issuer of `keycloak:8080`, while MCM had discovered
  `keycloak.mcm.localhost`. Same key, same claims, right audience and groups — and a
  bare `401 Authentication required`. Tokens must be fetched by the name MCM
  discovered. The client's 401 message now names issuer mismatch alongside the claim
  causes; it previously sent the reader after claims only, which is the wrong trail.
- **The app's `outDir` did not follow the convention.** Apps build to `dist/packages`;
  a per-app path put `main.js` where the container's `CMD` did not look.

#### What this exposes

The Secret file **does** update in place — the kubelet syncs it, which is why the
mount is a directory rather than a `subPath`. But the consuming code reads its PEM
once at startup, so the new bundle sits on disk unused until the pod restarts. The
scheduler logs a warning saying exactly that whenever it rewrites the Secret. Fixing
it properly is the reloadable-credentials work, currently deferred.

#### DNS collision fixed in passing

`refresh-compose-dns.sh` now deduplicates hostnames, first network wins. MCM's stack
also aliases a container `vault`, and without this the last network scanned silently
won — pointing `vault` at MCM's rather than the Pivotal one.

### `apps/trust-manager` exists — peer JWS sync · 2026-09-02

The service the design has assumed all along now exists, with the first of its
scheduled operations (`architecture.md` §7).

| File | Change |
| --- | --- |
| `packages/apps/trust-manager/` | **new** — app, settings, `.env.example` |
| `packages/core/trust/domain/` | **new** — `TrustDomainModule`, `PeerJwsSyncScheduler` |
| `nest-cli.json`, `package.json` | register both; `build:`/`start:apps-trust-manager` |

**Why this job first.** web-inbound cannot verify a peer's signature without that
peer's public key, and until now nothing fetched them. It is also the job that turns
`shared/mcm-client` from a library into something used.

**One MCM call per tick, not one per tenant** — `GET /dfsps/jwscerts` is an aggregate
endpoint outside the `/dfsps/{dfspId}/` path, so one credential and one token cover
every peer.

**Own tenants are skipped, and this is the load-bearing rule.** Pivotal's own tenants
come back in that aggregate list, because trust-manager published them. Writing one
back as a `peer` would strip its `self` role and with it web-outbound's ability to
find a signing key for that tenant. MCM is downstream of us for a `self` row, never
upstream. Verified live: with `wallet1` and `wallet2` present in MCM, a sync reported
`created: 6, skippedSelf: 2`, and both kept `role=self`, `jws_sign_enabled=1` and
`jws_verify_mode=require`.

**`jws_verify_mode` is never overwritten either.** It is a local rollout decision per
source; MCM has no opinion about it, and clobbering it would silently undo an
operator's cutover.

**Verified against the live MCM and database:** first run
`{total: 8, created: 6, skippedSelf: 2}`; second run
`{created: 0, updated: 0, unchanged: 6, skippedSelf: 2}` — idempotent. Builds clean;
`shared-fspiop` 90/90; `tsc` at the 11-error baseline.

#### Two deliberate choices

- **No migrations at startup.** `participant_key` belongs to the participant domain
  and is migrated by web-pivotal and app-auditor. Two processes racing the same
  history table on boot is a failure mode worth not having.
- **No HTTP listener.** trust-manager is a control plane with a scheduler; the data
  plane never calls it, so a control-plane outage cannot stop a transfer. The
  operator-initiated REST surface in §7 comes later.

#### Test hygiene fixed in passing

The `mcm-client` integration test originally created tenants with a random suffix per
run, which left a permanent tenant in MCM every execution and grew the aggregate pull
without bound. It now uses fixed ids and tolerates re-creation.

### `shared/mcm-client` written and proven against a live MCM · 2026-09-02

| File | Change |
| --- | --- |
| `packages/shared/mcm-client/` | **new** — `McmAxios`, `McmTokenProvider`, `McmSettings`, DTOs, `McmException` |
| `tests/integration/mcm-client-test.ts` | **new** — 3 tests against a real Connection Manager, skipped when none is running |
| `nest-cli.json`, `package.json` | register the library and `build:shared-mcm-client` |

**Own client, not the upstream one.** `pm4ml/mcm-client` is single-tenant: one DFSP, one identity,
one `ConnectionStateMachine`. Pivotal is one organisation fronting many, and MCM's own API shows the
mismatch — it stores a CA per `dfspId`, so Pivotal posts **one certificate N times**. The reuse is
model shapes, not machinery.

**`publishAndVerifyJwsKey` is the method that matters.** It publishes, reads back, and throws unless
the stored PEM is byte-identical. This *replaces* MCM's validation signal rather than supplementing
it: MCM records a `validationState` that nothing anywhere acts on, and its validator is parse-only
and RSA-only. A read-back catches truncation, a failed write, the wrong tenant and later drift —
none of which a parse would notice even for a key it accepts (§A1).

**A 401 retries once with a fresh token, then surfaces.** A cached token can expire between the
check and the call. The resulting `McmException` names the actual cause, because MCM's own 401 says
only `Authentication required` for what is usually a missing audience or `groups` claim.

**Verified against MCM v3.8.0:** Hub CA pulled; one CA registered under two tenants; a key published,
read back byte-identical, and found in the aggregate pull; a bad credential surfaces an
`McmException` rather than a raw axios error. 3/3 pass. `shared-fspiop` still 90/90, and `tsc` holds
at the 11-error pre-existing baseline.

#### macOS will not resolve `mcm.localhost`

Node's `getaddrinfo` does not special-case `*.localhost` subdomains; curl does, and Linux resolvers
do. So `mcm.localhost` fails `ENOTFOUND` from Node while working fine from `curl`, which is a
confusing pair of symptoms. The test reaches traefik on `127.0.0.1` with an explicit `Host` header
instead, using the injected-client seam on `McmAxios`. Adding the names to `/etc/hosts` also works
and is the tidier fix for interactive use.

#### Still not exercised

Inbound enrollment — `POST /dfsps/{id}/enrollments/inbound` then `/sign`, which yields web-inbound's
server certificate. It is a different issuance path from every other certificate in this programme,
and it is the one remaining MCM call phase 5 needs.

### MCM stood up locally, API surface validated · 2026-09-02

Phase 4 groundwork. `implementation-plan.md` §5 requires MCM to **precede** Hub-facing mTLS — CA
registration, the Hub CA pull and inbound enrollment are all MCM calls — so this comes before step 6.

| File | Change |
| --- | --- |
| `implementation/mcm-api-notes.md` | **new** — what a real MCM does, established by running one |

Local MCM: `DATABASE_PORT=3307 docker compose --profile full up -d` in `connection-manager-api`.
The override is required — MCM's MySQL wants 3306, which `ml-core-test-harness` holds. ~1.4 GiB.

**Every endpoint `shared/mcm-client` needs is verified working** against v3.8.0, and three design
claims are now confirmed rather than argued:

| Claim | Evidence |
| --- | --- |
| The same CA registers under N tenants (settled decision 6) | Pivotal's `pki_hub_client` root posted to `wallet1` and `wallet2` — both `VALID` |
| RSA keys register `VALID` (settled decision 3) | both tenants' RS256 keys `VALID`; the EC-`INVALID` problem does not arise |
| Byte-identical read-back is implementable (§A1) | `POST` then `GET` returned exactly the PEM sent |
| MCM's native per-DFSP credential model (Part C) | creating the tenants auto-created Keycloak clients `wallet1`, `wallet2` |

**Auth will cost a day if you do not know this.** A machine token needs `aud` containing
`connection-manager-api` **and** a `groups` claim, and the stock service client has **no protocol
mappers at all**. Missing `groups` is the nastier one: `extractRoles` spreads the result of
`claims.groups?.map(...)`, so an absent claim throws `TypeError: roles is not iterable` rather than
yielding an empty role set — a bare 401 to the caller and a type error in the log.

**Two gaps found:**

- `POST /dfsps` **requires `email`**, which no design document mentions.
- `GET /dfsps/{id}/credentials` returns **404** in v3.8.0, for tenants whose Keycloak clients exist.
  Part C treats it as the bootstrap path precisely because `POST` invalidates the existing secret with
  no grace period. That warning stands; the `GET` path needs investigating.

Inbound enrollment — web-inbound's server certificate, a different issuance path from every other
certificate here — is **not yet exercised**.

### Hub CA trust bundle — the phase-5 blocker, closed · 2026-09-02

| File | Change |
| --- | --- |
| `pivotal/scripts/setup-hub-trust.sh` | **new** — writes Secret `hub-ca-bundle` |
| `pivotal/helm/templates/apps.yaml`, `values.yaml` | mount it into web-outbound and web-inbound; `global.hubCaSecretName` |
| `pivotal-thitsawallet-connector/deploy/local-k3d.yaml` | same mount for the connector |
| `design/architecture.md` §5.1, §7 · `design/hub-facing-leg.md` B3 · `implementation/pki-issuance-flows.md` §3.4 | record the resolution |

**The question was wrong, which is why it stayed open.** It was posed as *"which pipe carries
`hub_trust.hub_ca` to the data plane?"* — and there is no good answer, because connectors have no
MySQL access by design. Applying `architecture.md` §5.1 literally settles it: *one authoritative
store, chosen by who reads it*. The Hub CA is read by web-outbound, the Gateway **and every
connector**, so MySQL cannot own it. The defect was `hub_trust` holding a row it had no business
owning, not a missing mechanism.

**Authority moves; nothing is duplicated.** The Secret is authoritative, `hub_trust` becomes a
non-authoritative mirror for expiry alerting — the same treatment `participant_key_ref` already has,
so no new precedent and no violation of one-store-per-value.

**Envoy chose the store, not preference.** Vault KV looked cheaper — connectors already read
`jwskey/<fspId>` there. But the Gateway needs the bundle as a client-cert trust store and reads
Kubernetes Secrets over SDS, not Vault. One Secret serves all three consumers; Vault KV would have
served two and required a second mechanism for the third.

**Verified** — all three read the same bundle from `/etc/pivotal/hub-ca/hub-ca.pem`:

| Consumer | |
| --- | --- |
| web-outbound | `O=Mojaloop, CN=Hub CA (stand-in)` |
| web-inbound | same |
| connector-wallet2 | same — **and it has no MySQL access**, which is the whole point |

**Stand-in, deliberately.** MCM is not wired up and the local Hub does no client-cert verification, so
the script generates a placeholder CA. Replacing it is one marked line — `GET /hub/ca` — and nothing
downstream changes. Mounted `optional: true` so a cluster without the Secret still starts; mTLS is
what needs it, and mTLS is not on yet.

**Not written: the `hub_trust` mirror.** That table does not exist — `implementation-plan.md` §2
proposes it and no migration creates it. The mirror lands with that migration.

### CA ceremony rehearsed locally — step 5a · 2026-08-31

The ceremony no longer needs cloud access to be exercised. `runbooks/ceremony-local.md` always
intended this — *"locally test the same PKI ceremony used in production without AWS KMS or
CloudHSM"* — and this implements it.

| File | Change |
| --- | --- |
| `pivotal/scripts/ceremony-local.sh` | **new** — both root ceremonies against SoftHSM2, plus the root CRL |

Requires `brew install softhsm opensc libp11`.

**Why SoftHSM is a faithful stand-in, not a toy.** Neither CloudHSM nor KMS is a CA: both only sign a
digest, and the ceremony script builds the X.509 itself (settled decision 13). So the script is the
same under all three backends and only the signing call differs — PKCS#11 `C_Sign` to CloudHSM,
`kms:Sign` to KMS, PKCS#11 `C_Sign` to SoftHSM2 here. Same interface, same code path
(`architecture.md` §4.6).

**Verified:**

| Check | Result |
| --- | --- |
| Root generated **inside** the device, per trust domain | 2 tokens, `pivotal-hub-client` and `pivotal-dfsp` |
| Root self-signed over PKCS#11 | `O=ThitsaWorks, CN=Pivotal Hub Client CA Root` |
| Root signs the Vault intermediate — once | intermediate installed via `intermediate/set-signed` |
| Leaf chains to the **HSM-held** root | `openssl verify`: OK |
| **Negative control** — leaf vs the *other* domain's root | **verification failed**, as it must |
| Root CRL signed by the HSM | rehearsed for both domains |
| Root private key readable out | refused |

The CRL is deliberately part of the ceremony rather than a later task: revoking an intermediate needs
a root-signed CRL, and that is far easier to write while the tooling is open than to discover during
an incident.

**What this cannot prove**, and 5b still must: that a KMS key is genuinely non-exportable, IAM
scoping, CloudTrail, and the zero-threshold `kms:Sign` alarm. The refusal above is `pkcs11-tool`
declining to implement private-key export — suggestive, not the same guarantee. And PKCS#11 is a
stable API but a loose contract: login models, session lifetime and available mechanisms vary by
device, so *"SoftHSM in CI will not reproduce CloudHSM's behaviour on any of them"*. Budget an
integration pass per real device.

#### Three failures worth recording

- **`--init-token --free` is not idempotent.** It takes a free slot and creates a *new* token each
  run, so re-running silently produced three tokens labelled `pivotal-hub-client`. The engine then
  matched ambiguously and reported `PKCS11_get_private_key returned NULL` — which reads as a missing
  key when the key is present and the tokens are the problem. The script now initialises only if the
  label is absent.
- **Two env vars fail quietly.** `OPENSSL_ENGINES` must point at libp11's directory, which is not
  this OpenSSL's `ENGINESDIR`; and `PKCS11_MODULE_PATH` selects the module the engine loads. Omitting
  the second produces the identical `returned NULL` message.
- **The ceremony destroys the issuing roles.** Re-signing an intermediate means
  `vault secrets disable` then re-enable, which drops every role on the mount, and cert-manager then
  fails with `unknown role: pivotal-client`. The ceremony now restores the role it removed. **Order
  matters: ceremony first, then anything that depends on a role.**

### cert-manager and Vault PKI — step 4b · 2026-08-30

Closes cluster bring-up. Leaf *renewal* is now automatic, which is the part that had to be real
automation rather than manual issuance: certificates expire on their own schedule regardless of who
remembers, and manual key provisioning is only tolerable while the people who built the system
operate it.

| File | Change |
| --- | --- |
| `pivotal/scripts/setup-vault-pki.sh` | **new** — both trust domains, issuing roles, cert-manager's Vault policy and auth role. Idempotent; re-run after a Vault pod restart |
| `pivotal/helm/cert-manager-issuers.yaml` | **new** — `vault-issuer` ServiceAccount, the `serviceaccounts/token` RBAC, and one `ClusterIssuer` per trust domain |

Built from `prod-hub-guinea-gitops/apps/vault-pki-setup/certman-rbac.yaml`, which already runs this
pattern. Production declares it through `vault-config-operator` CRDs; locally the same objects are
created with the Vault CLI, so no operator is needed.

**Two trust domains, four mounts.** Each domain has a root and an intermediate, which is the
structure the design specifies:

| Mount | Role | Purpose |
| --- | --- | --- |
| `pki_hub_client_root` + `pki_hub_client` | `pivotal-client` | Hub-facing client leaves — web-outbound and each connector |
| `pki_dfsp_root` + `pki_dfsp` | `dfsp-client` | client certs issued **to** DFSPs |

**Verified, including the negative control.** A leaf issued from `pki_hub_client` chains
leaf → intermediate → root (`openssl verify` OK), carries **TLS Web Client Authentication only**, and
**fails** to verify against `pki_dfsp`'s root. That last check is the one that matters: merging the
two domains would make a DFSP's client certificate trusted by the Hub (`architecture.md` §4.7).

**Renewal is scheduled, not just configured.** The test leaf: issued 2026-08-30, `renewalTime`
2026-10-29, expiry 2026-11-28 — 60 of 90 days, and no MCM interaction, because what MCM registers is
the CA and not the leaf (settled decision 6).

**Roles use `sign`, never `issue`.** `issue` makes Vault generate the keypair; cert-manager creates
the private key in-cluster and sends only a CSR. The secret holds `tls.key` alongside `tls.crt`, and
Vault never sees it. This is the correction §5 of `pki-issuance-flows.md` records against
`dfsp-facing-leg.md` §2.

#### One deviation from the design, and it is the whole of step 5

The roots here are **generated inside Vault**. In production the root is a non-exportable **AWS KMS**
key (KMS-backed) or a CloudHSM key (HSM-backed), signing its intermediate exactly once in a ceremony.
Everything below the root — intermediates, roles, cert-manager, issuance, renewal — is identical
under both, so step 5 replaces three ceremony steps and touches nothing else.

#### Worth knowing

- `ca.crt` in the secret is the **root**; `tls.crt` is **leaf + intermediate**. A verification that
  passes `ca.crt` as `-untrusted` fails with *"unable to get local issuer certificate"* and looks
  like a broken chain when nothing is wrong.
- The `vault-issuer` ServiceAccount holds no token of its own. cert-manager mints one through the
  TokenRequest API, which is what the `serviceaccounts/token` Role grants. Without that Role every
  issuance fails 403 and the ClusterIssuer never goes Ready.

### Cluster bring-up — Vault Kubernetes auth, both languages · 2026-08-27

**Committed 2026-08-28** as `de1d666` (`pivotal`) and `1e9b3a3` (`pivotal-thitsawallet-connector`).
Closes the last unverified assumption sitting under shipped work: the production Vault credential
path had never executed in either language.

| Repo | File | Change |
| --- | --- | --- |
| `pivotal` | `helm/templates/serviceaccounts.yaml` | **new** — one ServiceAccount per component |
| `pivotal` | `helm/templates/_helpers.tpl` | `pivotal-stack.serviceAccountName` helper |
| `pivotal` | `helm/templates/apps.yaml` | `serviceAccountName:` on all 9 Deployments |
| `pivotal` | `helm/values.yaml` | per-component `serviceAccount.{create,name}`; Vault env for web-outbound |
| `pivotal` | `helm/values-local-k3d.yaml` | **new** — dev overlay; infra stays in Compose |
| `pivotal` | `scripts/refresh-compose-dns.sh` | **new** — CoreDNS records for Compose networks |
| `pivotal` | `scripts/seed-vault-jwskeys.sh` | **new** — stands in for trust-manager |
| `pivotal-thitsawallet-connector` | `Dockerfile.local` | **new, temporary** — see pending action 2 |
| `pivotal-thitsawallet-connector` | `deploy/local-k3d.yaml` | **new** — SA + Deployment |

**The chart defined no ServiceAccounts at all.** All nine Deployments ran as `default`. Vault's
Kubernetes auth binds a role to `bound_service_account_names` + `bound_service_account_namespaces`,
so per-tenant scoping of private keys was not merely unconfigured — it was **impossible**. This is
the single most consequential line of the change.

**Topology: hybrid, deliberately.** Only Pivotal services and Vault run in k3d; Mojaloop, MySQL,
NATS, Redis and DemoWallet stay in Compose and are reached by container name. Full Mojaloop in a
local cluster needs ~14–19 GB and proves nothing the Compose stack had not already proven — step 4
is about the *credential* path, not the payment path.

**Verified — the isolation matrix, from inside the pods:**

| | wallet1 | wallet2 | cofinagn |
| --- | --- | --- | --- |
| `web-outbound` | read | read | read |
| `connector-wallet1` | read | **403** | — |
| `connector-wallet2` | **403** | read | **403** |

That is `architecture.md` §3 — *a compromised connector signs as one DFSP, a compromised web-outbound
as all of them* — demonstrated rather than asserted. In the KMS-backed profile this policy **is** the
isolation boundary, per the 2026-08-24 amendment to decision 4.

Then a full three-call send-money reached **COMPLETED** with all three services as pods. See *Proven,
not just tested*.

#### Four things that cost time, recorded so they do not again

- **`coredns-custom` crash-loops CoreDNS.** k3d scans only the one `--network` it is created with, so
  other Docker networks need host records. The obvious injection point — a `*.override` file using the
  `hosts` plugin — fails: k3d's Corefile already uses `hosts` for `NodeHosts`, and CoreDNS permits that
  plugin **once per server block**. Entries must merge into `NodeHosts` itself.
- **A bare `vault` resolves to the wrong Vault.** Those same host records make `vault` point at the
  *Compose* container. From any other namespace the cluster search domains fall through to it. Always
  use `http://vault.vault.svc.cluster.local:8200`.
- **The Hub reaches web-inbound only through a port-forward.** Every `participantEndpoint` row points
  at `http://host.docker.internal:3201`. Do **not** rewrite them; run
  `kubectl port-forward -n pivotal svc/web-inbound 3201:3201 --address 0.0.0.0` — `0.0.0.0` is
  required, and it dies with the pod. Symptom: ALS logs *"Destination communication error - Failed to
  send HTTP request to host"* and send-money times out with 2004.
- **Only one connector per tenant may run.** The `connector-consumer-*-<fsp>` durables are a queue
  group, so an IDE-launched connector and a pod split messages non-deterministically.

#### Two naming traps

- The Java connector reads **`VAULT_URL`**; the TypeScript apps read **`VAULT_ADDRESS`**. Same concept,
  different name across the two codebases.
- `PUT /secured/sendmoney/{id}` with `acceptParty` also requires **`amount`**, or it returns 400/3102
  `[ amount is required ]`.

#### Dev-mode Vault loses every key on restart

The local Vault runs `storage: inmem`. A Docker Desktop restart had already wiped `wallet1`'s private
key, leaving `jws_sign_enabled=1` with the public half in MySQL and no private half anywhere.
`scripts/seed-vault-jwskeys.sh` is the recovery: it migrates a key still in MySQL, or regenerates and
updates the DB public key to match. Re-run it after any Vault pod restart.

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
  (others do not). A `@Bean` there would have reached part of the fleet only. Every
  deployable scans `com.thitsaworks.mojaloop.coreconnector`, so a component reaches every deployable
  without the deployable repo changing.
- **`FspiopCallbackService` derives its own client** — `http.newBuilder().addInterceptor(...)`.
  Relying on the injected client to carry signing would fail in production, where deployables
  override `sharedOkHttpClient`. `newBuilder()` shares the connection pool and
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


**Verification:** the deployable builds clean against 0.0.25. Each `docker-entrypoint.sh` was dry-run with a
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

**A real tenant was moved to Vault custody.** `wallet1`'s private key was moved from
`participant_key` into `secret/pivotal/jwskey/wallet1`, and the column set to `NULL`. Its public key
stayed in MySQL. The service then signed and verified using a key it read from Vault, with no
plaintext key left in the database.

> **Superseded by S9 (2026-08-30).** Moving the existing key is *not* the path a deployment follows.
> Any value that has sat in that column is compromised, so a deployment **regenerates**. What this
> run proved is still valid — the service signs from a Vault-held key with the column `NULL` — but do
> not read it as a migration recipe.

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
available as the DFSP backend for the standard connector.

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

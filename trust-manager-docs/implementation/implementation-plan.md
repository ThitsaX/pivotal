# Implementation Plan

Schema, service changes, infrastructure, phasing and verification. Design rationale lives in
[`architecture.md`](../design/architecture.md) and the two leg documents.

---

## 1. Platform requirements

This design targets **any** Kubernetes platform — managed cloud, self-managed cloud, or on-premise.
The table below states the **capability** each deployment must provide and the product that satisfies
it.

Two rows are **settled by project requirement** and are not open to substitution: delegated signing
(§1.1) and the certificate authority (§1.3). The remainder are the infrastructure team's choice, and
each has more than one acceptable answer.

| Capability | Why it is needed | Acceptable implementations |
| --- | --- | --- |
| **Signing** — generate an RSA-2048 keypair, sign a SHA-256 digest, return the public key | The `Signer` contract | **HSM-backed:** CloudHSM via PKCS#11, non-exportable (§1.1). **KMS-backed:** in-process, key from Vault KV. SoftHSM through the same PKCS#11 interface for dev and CI |
| **Certificate authority** — issue leaf certs from a private CA, programmatically | Two CAs: DFSP-facing and Hub-facing client | **Vault OSS PKI** — intermediates in Vault in both profiles; roots in **CloudHSM** (HSM-backed) or **AWS KMS** (KMS-backed), §1.3. No Enterprise licence |
| **Automated leaf lifecycle** | Leaf renewal must need no human and no MCM interaction | cert-manager with an issuer for the chosen CA |
| **Workload identity** — a pod proves who it is without a long-lived secret | Per-tenant key access control (§1.2) | Kubernetes ServiceAccount + Vault k8s auth, cloud workload-identity federation, or SPIFFE/SPIRE |
| **Durable pub/sub with last-value replay** | Trust-cache invalidation and cold start | NATS JetStream (`MaxMsgsPerSubject=1`, `replicas=3`) |
| **Ingress with client-certificate termination and identity forwarding** | DFSP-facing mTLS; must forward the client-cert fingerprint and **strip** any client-supplied copy | Istio/Envoy (`SANITIZE_SET` XFCC), NGINX Ingress, or any gateway with an equivalent guarantee |
| **Mojaloop `connection-manager-api`** + its database | JWS registry and Hub CA distribution | MCM v3.8.0 |
| **OIDC provider** | MCM's authentication dependency | Keycloak, or any OIDC provider MCM accepts |
| **Metrics, alerting, dashboards** | Cert-expiry ladder, consumer lag, sign latency and error rate | Prometheus / Alertmanager / Grafana, or equivalent |

**Ordering:** the OIDC provider precedes MCM, and MCM precedes Hub-facing mTLS (§5). Everything else
can proceed in parallel.

### 1.1 Signing provider — settled by requirement

The governing requirements are set out in [`architecture.md`](../design/architecture.md) §4.0. They settle
this row rather than leaving it open:

- **R1/R2** require operations *performed within* **dedicated** HSMs. That excludes software
  keystores, excludes protecting a software keystore with an HSM-held key, and excludes multi-tenant
  cloud KMS.
- **R3** names **AWS CloudHSM integrated with a KMS custom key store** for the cloud deployment
  period.

| | Product | Interface |
| --- | --- | --- |
| **HSM-backed** — cloud phase (now) | **AWS CloudHSM** — dedicated, FIPS 140-2 L3 | **PKCS#11** for signing; KMS custom key store for the Vault seal |
| **KMS-backed** | **none** — Vault KV + in-process signing | Node `crypto` / Java JCA; plain AWS KMS for the Vault seal |
| On-premise (deferred, **R4**) | client data centre HSM | PKCS#11 |
| Dev / CI | **SoftHSM** | PKCS#11 |

**R1–R4 drive the HSM-backed profile.** Where they are not stated, `vault-kv` is available — see
[`architecture.md`](../design/architecture.md) §0 and §4.8. The rest of this section describes HSM-backed.

**Use PKCS#11 direct for signing, not the KMS API.** Both reach the same cluster and both satisfy
**R1**, but the KMS path adds a **per-request charge on top of hardware already paid for**, and
stacks KMS API quotas on top of HSM capacity. Keeping the custom key store in genuine use for the
Vault seal satisfies **R3** literally while the metered path stays off the hot path.

**Capacity envelope for the infrastructure team**, derived in
[`hub-facing-leg.md`](../design/hub-facing-leg.md) §A1:

- **signatures per second** — roughly `TPS × 6`, so **480–600/sec at the agreed 80–100 TPS**. RSA-2048 signing is ~1,000–1,500/sec per core in software and comfortably inside a two-HSM cluster, so neither profile is throughput-constrained at this volume
- **latency budget per signature**, noting ~6 occur serially per transaction
- **key count** — one per onboarded DFSP, plus two CA roots, plus headroom
- **concurrent PKCS#11 sessions and client connections** — this scales with **tenant count**, not
  with TPS, and is a separate CloudHSM limit from throughput. web-outbound holds sessions spanning
  every tenant's key under one crypto user; each connector adds another client to the cluster; and
  trust-manager holds one more for key generation. Check the per-cluster client and per-client
  session caps against your onboarding roadmap, not against today's tenant count
- **HSM count is set by HA, not throughput.** A two-HSM cluster is the practical floor regardless of
  volume, and at 80–100 TPS throughput is not the binding constraint — HA is
- **cluster count is the real cost driver** — one shared regional deployment versus one per country
- **per-operation audit logging**

### 1.2 Reaching CloudHSM without a long-lived secret

Every workload that signs must authenticate to the HSM. **CloudHSM authenticates crypto users with a
username and password, not with IAM policy** — which changes the shape of this from the cloud-KMS
case:

| Concern | Approach |
| --- | --- |
| Workload identity | Kubernetes ServiceAccount → Vault k8s auth, as today |
| Delivering CU credentials | Vault KV — see §1.2.1. **Credential and `keyRef` have different cardinality and do not share a path** |
| Per-tenant isolation | **One crypto user per DFSP**, owning that tenant's key, held by that tenant's connector |
| web-outbound | **One** CU, owning nothing, with every tenant key **shared** to it |
| Rotation | CU credentials are static — rotation is an operational procedure, not an expiry |

**Generate as the tenant's own CU.** Ownership in CloudHSM is conferred at creation and cannot be
transferred, and an owner always retains use rights — so whichever CU creates a key can sign with it
for the life of that key. [`architecture.md`](../design/architecture.md) §4.3 sets out the resulting ownership
matrix and states the residual privilege this leaves trust-manager.

**Never use one shared crypto user across all connectors.** That collapses the isolation described in
[`architecture.md`](../design/architecture.md) §3: any connector could then sign as any DFSP. CU provisioning
and rotation is open decision **O**, because retrofitting per-tenant crypto users across every
connector later is painful.

### 1.2.1 Credential and reference delivery

web-outbound authenticates as **one** crypto user and reaches every tenant key through sharing, so it
needs a single credential and *N* references. A connector needs one of each. That difference dictates
the paths:

**HSM-backed — `pkcs11`:**

| Reader | Vault KV path | Cardinality |
| --- | --- | --- |
| web-outbound | `secret/pivotal/hsmcred/web-outbound` | **one** — CU username + password |
| web-outbound | `secret/pivotal/keyref/<fspId>` | one per tenant |
| connector `<fspId>` | `secret/pivotal/hsmcred/<fspId>` | one — the owner CU |
| connector `<fspId>` | `secret/pivotal/keyref/<fspId>` | one |

**KMS-backed — `vault-kv`:** no crypto users exist, so there is one path shape only, and it carries
the key itself rather than a reference:

| Reader | Vault KV path | Cardinality |
| --- | --- | --- |
| web-outbound | `secret/pivotal/jwskey/<fspId>` | one per tenant — **it signs as every payer** |
| connector `<fspId>` | `secret/pivotal/jwskey/<fspId>` | one — its own tenant only |

Grant each connector's Vault policy exactly one path. web-outbound necessarily reads them all, which
is where the blast radius sits ([`architecture.md`](../design/architecture.md) §4.8).

Both are read after Kubernetes ServiceAccount authentication to Vault. **Not environment variables**:
those live in the Deployment manifest, appear in `kubectl describe`, need a redeploy to rotate,
require editing the manifest to add a tenant, and leave no record of who read them. Vault gives
short-lived tokens, per-path policy and an audit line per read — and `shared/vault` is in the plan for
exactly this.

One operational consequence: because web-outbound performs a **single** `C_Login` and reaches all
keys through that session, the PKCS#11 session pool is sized by **concurrency alone**. Onboarding a
DFSP adds a `keyRef` — not a session, and not a login.

### 1.3 CA bring-up — the root ceremony

CloudHSM holds keys but **is not a CA**: it cannot parse CSRs, build X.509, allocate serials or
publish CRLs, and no cert-manager issuer exists for a bare HSM key. So each trust domain is brought up
by a **one-time ceremony script**, run twice — once per domain:

| Step | Where | Vault feature |
| --- | --- | --- |
| 1. Generate the root keypair | CloudHSM, PKCS#11 | none — Vault uninvolved |
| 2. Self-sign the root certificate | ceremony script | none |
| 3. Generate the intermediate keypair and CSR | Vault PKI | `pki/intermediate/generate/internal` — **OSS** |
| 4. Sign that CSR with the root | CloudHSM, PKCS#11 | none — Vault uninvolved |
| 5. Import the signed intermediate | Vault PKI | `pki/intermediate/set-signed` — **OSS** |
| 6. Issue leaves thereafter | Vault PKI + cert-manager | **OSS** |

This is the standard externally-signed-intermediate pattern. **Vault never needs to know an HSM
exists**, which is why no Enterprise licence is required.

#### KMS-root variant — the KMS-backed profile

A deployment without an HSM ([`architecture.md`](../design/architecture.md) §4.8) still needs somewhere safe
for the roots. **Do not put them in Vault PKI** — that makes the online, network-reachable issuing
system also the trust anchor, and root compromise is the one failure no revocation can repair.

Use a **non-exportable AWS KMS asymmetric key** instead. Steps 3, 5 and 6 are unchanged; only the
root operations move:

| Step | HSM-backed | KMS-backed |
| --- | --- | --- |
| 1. Generate the root keypair | CloudHSM, PKCS#11 | `kms:CreateKey`, `SIGN_VERIFY` / `RSA_2048` |
| 2. Self-sign the root certificate | ceremony script | same script — TBS built locally, signed via `kms:Sign` |
| 4. Sign the intermediate CSR | CloudHSM, PKCS#11 | same script, same `kms:Sign` call |
| Root key at rest | inside the HSM | inside KMS, **`CreateKey` makes it non-exportable — there is no export API** |
| Root CRL signing | PKCS#11 script | same script, `kms:Sign` over the CRL TBS |
| Access control | crypto-user credentials | **IAM policy**, and every use lands in **CloudTrail** |

**Why KMS rather than an offline machine.** An air-gapped laptop was the earlier answer here and it
has been replaced. KMS is better on the axis that actually matters operationally: the root key is
created inside the service and **never exists on any human's machine**, so there is nothing to
generate locally and copy to production. It also brings IAM scoping and a per-signature audit trail,
neither of which an offline machine has. What it gives up is *dedication* — KMS is multi-tenant, so
this variant **cannot** be used where R1/R2 apply.

**Two controls this variant requires**, and they are not optional:

- **Keep the root-CA KMS key separate from the Vault auto-unseal KMS key.** Different keys, different
  policies, different blast radius.
- **Alarm on `kms:Sign` for the root key.** Legitimate use is roughly three events for the life of
  the deployment — two ceremonies plus a CRL — so alarm on **any** occurrence, the same zero-threshold
  pattern as `cu-trust-manager` in [`architecture.md`](../design/architecture.md) §4.3. Normal Pivotal and
  Vault workloads must hold no `kms:Sign` permission on it at all.

**Root creation is a one-time bootstrap — keep it out of GitOps.** Record the key ARN in the
deployment repo; do not let a reconcile loop own the trust anchor.

Write **both** variants of the ceremony script during phase 0, even if only one profile is being
deployed. They share the Vault-side steps and differ only in the signing call, and the second one
written from scratch later will not match the first.

**Build root CRL signing into the same script.** Revoking an intermediate requires a root-signed CRL —
a second bespoke PKCS#11 operation. Far cheaper to write while the ceremony tooling is open than to
discover during an incident.

After bring-up, **day-to-day certificate issuance never touches CloudHSM.** Vault PKI does all of it,
driven by cert-manager.

---

## 2. Schema

### New — `participant_key` (public registry, versioned)

`id`, `fsp_id`, `key_type` (`jws` / `access`), **`role` (`self` / `peer`)**, `algorithm`,
`public_key_pem`, `status` (`active` / `retiring` / `revoked`), `valid_from`, `valid_to`, `source`
(`self` / `mcm-pull` / `legacy`), `created_at`, `updated_at`.

The `role` column is a **prerequisite**, not a normalization — today `participant` cannot hold a
peer, because `add-signing-keys` marks `jwsPrivateKey` `@IsNotEmpty()`.

**No `kid` column.** Settled decision 2 rejects `kid` for accessKey rotation in favour of try-both,
and [`hub-facing-leg.md`](../design/hub-facing-leg.md) §A1 establishes that the FSPIOP protected header has
no `kid` field at all — the validator resolves `validationKeys[headers['fspiop-source']]`. Nothing
would read the column. An earlier draft carried one; it is removed rather than left to imply a key
selection mechanism that does not exist.

`source = legacy` marks a row carried over from the pre-migration `participant.jws_private_key` era.
[`hub-facing-leg.md`](../design/hub-facing-leg.md) §A3.1 requires all of them to be gone before phase 4.

### New — `participant_cert` (DFSP-facing client certs)

`id`, `fsp_id` (**the binding target**), `serial`, **`fingerprint_sha256`** (the runtime lookup key
from XFCC), `subject` (CN **enforced** to `fsp_id` at issuance), `cert_pem`, `ca_chain_ref`,
`status` (`active` / `retiring` / `revoked` / `expired`), `valid_from`, `valid_to`, `issued_at`,
`revoked_at`.

**Never hard-delete a row before `valid_to` passes.** Retire by status. A revoked certificate whose
row has been purged degrades from a *known revocation* into a *lookup miss*, and those are different
things — see open decision **D**.

**Issued validity: 1 year.** Long enough that renewal is an annual, scheduled task for each DFSP's
own operations team rather than a recurring support burden; short enough that a certificate whose
compromise went unreported does not persist indefinitely. This is a policy number that had not been
stated anywhere — the lifecycle, the overlap and the phase-7 expiry ladder all depend on it, and
`participant_contact` exists to carry the reminders. Renewal is the DFSP repeating the CSR flow, with
the previous certificate left `retiring` until its own `valid_to` passes.

### New — `participant_key_ref` (pointer, never key material)

`fsp_id`, `key_use` (`jws-sign` / `ca` / `mtls-server`), `provider` (`pkcs11` / `vault-kv` /
`aws-kms` / …), `key_ref`, `created_at`.

**This table is a non-authoritative mirror, not the source of truth.** The authoritative store for
`keyRef` is **Vault KV** at `secret/pivotal/keyref/<fspId>`, alongside the crypto-user credentials it
is always used with — see [`architecture.md`](../design/architecture.md) §5.1. Both readers already
authenticate to Vault: the connectors have no MySQL access at all, and web-outbound cannot sign
without pulling its credentials from there regardless.

The mirror exists for the portal, operator queries and reporting — "which key is tenant X on" as a
join rather than a Vault read. It is written *after* the Vault write. If it drifts, nothing breaks
and no reconciler is required, because nothing on the signing path reads it.

An earlier draft had this the other way round, with MySQL authoritative and Vault a projection. That
put one value in two stores under a non-transactional double write: a crash between the two left
web-outbound and the connector signing for the same FSP with **different keys**, permanently, with
nothing able to converge them. Removing the second copy is a better answer than reconciling it.

### New — `hub_trust` (Pivotal's own Hub-facing material)

`artifact` (`pivotal_client_ca` / `pivotal_server_cert` / `hub_ca`), `pem`, `fingerprint_sha256`,
`not_after`, `source`, `updated_at`. Drives expiry alerting.

Three artifacts, so three rows in steady state and up to six across a rotation overlap. Pivotal's
Hub-facing client **leaves** are deliberately absent — cert-manager owns their entire lifecycle and
they are registered nowhere.

### New — `mcm_ca_registration` (drift detection)

`fsp_id`, `ca_fingerprint_sha256`, `registered_at`, `status` (`active` / `stale` / `failed`).
Without it there is no way to tell whether a tenant's CA registration still matches the CA in use — a
silent failure that surfaces as TLS rejections for exactly one tenant.

### New — `participant_contact`

`fsp_id`, `contact_type`, `value`, `purpose` (e.g. `cert-expiry`).

### Changed — `participant`

Stop writing `jws_private_key`. Existing values are **not migrated** — fresh **RSA-2048** keys are
generated and re-published. **Retain the column**: a migration script has to be able to find and
clear the legacy rows it is retiring, and a dropped column leaves nothing to migrate *from*
(`status.md` **S9**). Corrected 2026-08-30; this sentence said "EC keys" and "then drop the column".
**Seed a `hub` participant** — none exists, and without it every Hub-originated error fails with
3105 once JWS is enabled.

**Generate fresh keys; do not migrate the existing ones.** RS256 makes migration *technically*
possible for the first time — the existing `participant.jws_private_key` values are already RSA, so
unlike the ES256 plan they could in principle be moved into Vault KV, or imported into CloudHSM,
preserving each public half and avoiding any republish.

They are regenerated anyway, because **they have been stored as plaintext in MySQL** and must be
treated as compromised. Importing a tainted key into an HSM buys custody of a secret that may already
have leaked. Settled decision 21.

All of this must complete **before** the first MCM publish in phase 4 — see
[`hub-facing-leg.md`](../design/hub-facing-leg.md) §A3.1. Until then no peer holds a Pivotal key and
regeneration is free; afterwards each one is a coordinated break.

### RBAC

New DFSP-scoped permissions for certificate enrollment. Auth migrations currently stop at `V9`.

---

## 3. Changes to existing services

| Area | Change |
| --- | --- |
| `shared/security` | `KeyProvider` / `Signer` interface; provider implementations; **`AccessKeyStore.get()` must return an ordered list**, not a single key |
| `shared/security/component/jwt/jwt.ts` | **Smaller than previously planned.** With both legs on RS256 the hardcoded `algorithms: ['RS256']` in `verify` (lines 89, 98) and the `RS256` default in `sign` are no longer *wrong*, only inflexible. Still **resolve the algorithm per key from `participant_key.algorithm`** so one DFSP can move later without a flag day; do **not** substitute a permissive `['RS256','ES256']` list. The real work here is the **protected header** — `typ`/`cty` and the lowercased header spread must go |
| `shared/fspiop` signing interceptor | rebuild the protected header to the five normative fields with exact casing; set `fspiop-uri` and `fspiop-http-method` HTTP headers; sign via `Signer` |
| `shared/fspiop` inbound guard | verify against `participant_key` (self **and** peer roles); honour `FSPIOP_VERIFY_INBOUND` (`off` / `verify-if-present` / `require`) and count unsigned-but-accepted requests per source |
| `web-outbound` `access.guard.ts` | try-both key verification; XFCC fingerprint lookup; **binding check** against `FSPIOP-Source`. Certificate checks gate on **XFCC presence per request**, never on a global flag — `architecture.md` §6.1 |
| `core/participant` key cache | `valid_to` is **enforced for `key_type = access`** and **advisory for `jws`**. A single table-wide "unexpired" filter would silently stop a JWS key being used at `valid_to`, with no overlap and no try-both to absorb it |
| **readiness probes** — web-outbound, web-inbound | Report **unready until the first cache load succeeds**, so a cold replica receives no traffic. This is what makes the fail-closed rule in open decision **D** cost nothing; without it, failing closed on a cold cache really would be an outage |
| cache miss path | **One bounded synchronous re-read of the authoritative store, then reject.** Never proceed without a row — the status and binding checks cannot run without one |
| `core/participant` stores | source from `participant_key`; **per-fspId reload**; JetStream subscriber |
| `core/participant` handlers | register (not issue) accessKeys; publish to MCM; stop writing private keys |
| `shared/mcm-client` | **Read back and compare after every publish** — `GET /dfsps/{dfspId}/jwscerts`, assert the PEM matches what was sent. MCM's own `validationState` is unusable as a signal because its validator is RSA-only and flags every EC key `INVALID`, so this is the only check that distinguishes a good registration from a bad one |
| **Java connectors** (one per tenant) | build the protected header, sign via **PKCS#11** to CloudHSM, manage the HSM session, send the two new HTTP headers, subscribe to `trust.keys.<fspId>`, **ack after the Hub PUT** |
| **web-inbound Gateway** | `mode: MUTUAL` for the Hub; serve the Hub-CA-signed server cert; trust the Hub CA for inbound client certs |
| `web-pivotal` + portal | CSR upload, cert + chain download, cert status, accessKey registration, contact management |
| **new** | `apps/trust-manager`, `core/trust/domain`, **`shared/pkcs11`** (the `Signer` — `C_GenerateKeyPair` for trust-manager, `C_Sign` for the data plane, **plus a session pool** — see below), **`shared/vault-kv-signer`** (the second `Signer` — reads the PEM from Vault KV once at startup and signs in-process; no network call per signature), `shared/vault` (KV + auth), `shared/mcm-client`, `shared/trust-events`, shared Java signing artifact, **root-ceremony script** (PKCS#11 and offline variants) |

**`shared/pkcs11` must pool sessions, not hold one.** Many PKCS#11 implementations serialise
operations on a single session, and some vendor libraries take a global lock. web-outbound signing
for every tenant through one session would serialise all signing across all tenants — a throughput
ceiling that no amount of HSM capacity relieves, and one that only shows up under concurrent load.
Size the pool to expected concurrency, not to tenant count, and treat it as a first-class
requirement rather than an optimisation.

---

## 4. Propagation defects to fix

These exist in the current code and are independent of everything above.

**`num_replicas` is never set.** `resolveStreamWithLimits` (`shared/nats/component/stream-provisioner.ts`)
calls `streams.add` without it, so every stream is created at R=1. `TRUST_KEYS` at R=1 is a
propagation SPOF.

**`enforceStreamLimits` cannot reconcile `MaxMsgsPerSubject`.** It compares only `max_age`,
`max_bytes` and `discard`, so it reports `in-sync` while the `DeliverLastPerSubject` cold-start
guarantee is silently broken.

**`ParticipantSigningKeysCache` rebuilds wholesale.** It calls `findAll()` and rebuilds all maps every
tick, with no version tracking — and `participant` has no `updated_at`. Per-fspId reload and
version-based reconcile are both net-new.

**The kill-switch is a trap.** `TRUST_INVALIDATION_ENABLED=false` leaves staleness at the relaxed
reconcile interval — far worse than today's 5-second default. It must also restore a tight interval.

**Consumer mode must not be copied between the two consumers.** Trust-cache is ephemeral fan-out;
FSPIOP work is a durable queue group. They sit in the same codebase and look similar.

**Retention must be bounded.** Confirm no stream retains messages indefinitely without a stated
reason.

---

## 5. Phasing

> **Superseded in ordering, not in content — 2026-08-25.** The phases below remain the right units of
> work, but delivery dates reorder them: the KMS-backed deployment ships first, so `pkcs11` moves out
> of phase 1 and to the end. `implementation/status.md` carries the current order and what that
> deferral costs. Read the phases here for *what each one contains*; read `status.md` for *when*.


0. **Key store and CA bring-up.** *Differs by profile — this is the only phase that does.*

   **HSM-backed:** provision the CloudHSM cluster and the KMS custom key store, move Vault to auto-unseal
   against it, and run the **root ceremony** twice (§1.3) so both trust domains have a CloudHSM root
   and a Vault PKI intermediate. **Prove the ownership and access matrix on real hardware before any
   application work starts** (§1.2, verification below) — it is the assumption every later phase rests
   on, and the one most easily wrong.

   **KMS-backed:** no cluster. Configure Vault for plain **AWS KMS auto-unseal**, create **two**
   non-exportable KMS root-CA keys — one per trust domain, and both separate from the unseal key — and
   run the **KMS-root variant** of the ceremony twice (§1.3). Confirm the `kms:Sign` alarm fires on a
   test signature before the real ceremony. There is no ownership matrix to prove, because there are
   no crypto users — the equivalent control is IAM policy plus Vault path policy, verified in phase 1.

   *Prerequisite for phases 1, 5 and 6 in both profiles.*
1. **Custody + JWS correctness.** Both `Signer` implementations — the PKCS#11 one *with its
   session pool*, and the `vault-kv` one — behind a single interface, exercised in CI. *(Ordering
   superseded: only `vault-kv` was built, and `pkcs11` is deferred to the HSM-backed delivery. The
   argument below still holds, and the risk it describes has been accepted rather than answered.)* Per-DFSP
   **RSA-2048** keys generated fresh (settled decision 21), `participant_key` with self/peer roles,
   seed the `hub` participant, fix the protected header, resolve the algorithm per key, write the
   conformance vectors. *Nothing external changes yet — signatures simply become correct.* **Every
   tenant must reach its final generated key in this phase** — after phase 4 publishes, regeneration
   stops being free.

   Building both signers here, not later, is what keeps the profile a configuration rather than a
   fork: two implementations against one interface is the only way to know the interface has not
   quietly absorbed HSM assumptions ([`architecture.md`](../design/architecture.md) §0, §4.8).
2. **Propagation.** `TRUST_KEYS` at R=3, `shared/trust-events`, `TrustCacheSubscriber`, the §4 fixes,
   consumer-lag alerts. *Sub-second invalidation, self-bootstrapping cold start.*
3. **Connector signing.** Shared Java artifact, Vault auth per connector, keyRef and HSM credentials
   from Vault KV, PKCS#11 session handling, the
   invalidation consumer, ack-after-PUT. *Payee-side callbacks become signed.*
4. **MCM registry sync.** Keycloak, then MCM, then `shared/mcm-client`; publish own keys and pull
   peers. *Interop with external participants.*

   Then enable **inbound verification** — `FSPIOP_VERIFY_INBOUND=verify-if-present`
   ([`architecture.md`](../design/architecture.md) §6.2). It stays there until the unsigned-request counter
   per source reaches zero, which needs the Hub operator to enable JWS signing and each peer to
   start signing. Only then does `require` become safe. Advancing straight to `require` rejects every
   Hub-originated error, because the Hub does not sign today.
5. **Hub-facing mTLS.** `pki-hub-client`, CA registration across tenants, cert-manager leaves, Hub CA
   pull, server-cert enrollment. *Transport authenticated.*

   MCM **must** precede this phase, not follow it: CA registration, the Hub CA pull and inbound
   enrollment are all MCM calls made through `shared/mcm-client`.
6. **DFSP-facing mTLS.** DFSP-facing CA, `participant_cert`, enrollment API, portal views, parallel
   endpoint, binding enforcement.
7. **Lifecycle and alerting.** Scheduler, expiry metrics, Alertmanager ladder, `participant_contact`,
   runbooks.

Phase 0 is infrastructure and a one-time ceremony, so it can run in parallel with design work on the
rest. Phase 1 then delivers the most value per unit of risk: it fixes custody *and* the signature
format without any peer coordination, because nothing on the Hub validates yet.

---

## 6. Verification

**Phase 0 — KMS-backed:** Vault unseals automatically against plain AWS KMS after a full restart with
no operator input. Each trust domain chains correctly: leaf → Vault intermediate → **offline** root.
The root private key is confirmed absent from every networked host. Rehearse the root CRL path once.

**Phase 0 — HSM-backed:** a key generated in CloudHSM reports as non-exportable and cannot be extracted
by any API. Each trust domain chains correctly: leaf → Vault intermediate → CloudHSM root. Vault unseals
automatically after a full restart with no operator input. Rehearse the root CRL path once, before
you need it.

**The ownership matrix, on real hardware, before application work begins — HSM-backed only.** Every
later phase assumes it, and it cannot be verified against SoftHSM:

1. Create `cu-tenantA`, `cu-tenantB` and `cu-web-outbound`.
2. Logged in as `cu-tenantA`, generate a keypair. Confirm `key list` shows `cu-tenantA` under
   `key-owners` and an empty `shared-users`.
3. `key share` it to `cu-web-outbound`. Confirm `cu-web-outbound` appears under `shared-users` and
   **not** under `key-owners`.
4. Confirm `cu-web-outbound` **can** sign with it, and **cannot** delete, export, re-share or alter
   its attributes.
5. Confirm `cu-tenantB` can do none of the above with tenant A's key.
6. Confirm the owner still signs after sharing — sharing is additive, not a handoff.
7. **Confirm there is no ownership-transfer operation.** If a future CloudHSM release adds one, the
   privilege note in [`architecture.md`](../design/architecture.md) §4.3 can be revisited; until then it
   stands.

Record the result as the authoritative access matrix for the deployment. If any step behaves
differently from the above, stop and re-derive §4.3 before writing code against it.

**The Vault path matrix — KMS-backed.** The `vault-kv` equivalent of the ownership matrix, and the
only thing standing between one tenant and another's key:

1. Confirm connector `<fspId>`'s Vault policy grants **read on `secret/pivotal/jwskey/<fspId>` and
   nothing else** — a read of another tenant's path is denied.
2. Confirm web-outbound's policy grants read across all `jwskey/*`, and **no write anywhere**.
3. Confirm no key material is reachable through an environment variable, a ConfigMap, or
   `kubectl describe` on any workload.
4. Confirm Vault's audit log emits one line per key read, and that a steady-state pod produces
   exactly one per key at startup.
5. Confirm core dumps are disabled and heap-dump-on-OOM is off for web-outbound.

**Phase 1** — conformance vectors pass in both Java and TypeScript, **and against both `Signer`
implementations**. A signed request validates against a real `JwsValidator` instance with the
registered public key. Signing works with the private key absent from MySQL. Confirm the same
conformance vector produces a **byte-identical signing input** under `pkcs11` and `vault-kv` — that is
what proves the interface has not absorbed backend assumptions.

**Phase 2** — kill a data-plane pod mid-rotation and confirm it **reports unready until its cache has
loaded**, then converges and begins serving. Stop JetStream and confirm the reconcile poll still
converges. Verify the stream reports `replicas=3` and `MaxMsgsPerSubject=1`. **Confirm web-outbound
and the tenant's
connector resolve the same `keyRef` from the same Vault path** — that they read one store is what
makes divergence between two signers for one FSP impossible rather than merely unlikely.

**Signing throughput** — drive concurrent signing through web-outbound for several tenants at once
and confirm throughput scales with concurrency. Target is **480–600 signatures/sec** at 80–100 TPS.
Under `pkcs11`, a flatline means the session pool is serialising (§3) — the one failure that no
amount of HSM capacity relieves. Under `vault-kv` there is no pool and no network call, so RSA-2048
signing should be CPU-bound and scale with cores.

**Phase 3** — a connector signs and the Hub accepts. Force a Hub 500 and confirm JetStream redelivers
rather than the transfer hanging.

**HSM-backed:** disable a connector's CloudHSM crypto user and confirm it **fails closed** — revoking its
*Vault* policy is not the equivalent test, because by then the connector has cached its `keyRef` and
holds an open PKCS#11 session, so it keeps signing until the HSM refuses it.

**KMS-backed:** there is no equivalent kill switch, and that is worth stating rather than discovering.
Once the key is in process memory, revoking the Vault policy stops the *next* read, not the current
process — so cutting off a compromised connector means terminating the pod and rotating the key, which
is a coordinated break per FSP (§A3.1). Confirm the runbook says so.

**Phase 4** — no `participant_key` row with `key_type = jws` remains at `source = legacy` **before**
the first MCM publish. After the publish, `FSPIOP_VERIFY_INBOUND=verify-if-present` accepts an
unsigned Hub error and increments the counter rather than rejecting it, and `require` is not set
until that counter is zero.

**Read back every publish.** `GET /dfsps/{dfspId}/jwscerts` returns a PEM byte-identical to the one
sent. MCM will report the record `INVALID` because its validator is RSA-only
([`hub-facing-leg.md`](../design/hub-facing-leg.md) §A1) — that is expected and not a failure, which is
precisely why the read-back exists: it is the only check that can still tell a good registration from
a bad one.

**Standing regression check, not one-off:** after any MCM version bump, confirm an EC key still
survives `POST` → `GET /dfsps/jwscerts`. Nothing filters on `validationState` in v3.8.0, on either
the server or in PM4ML's peer client, but that is incidental behaviour rather than a contract.

**Phase 5** — `GET /dfsps/{dfspId}/ca` returns the same CA for every tenant, matching
`mcm_ca_registration`. `openssl s_client` with the leaf completes against the Hub ingress. Two
tenants transact over one pooled connection with a single client certificate. Force a cert-manager
renewal and confirm traffic continues **with no MCM interaction** — this is what proves CA-level
registration works.

**Phase 6** — a DFSP presenting a certificate whose `fsp_id` does not match its `FSPIOP-Source` is
rejected. **A certificate that chains to the DFSP-facing CA but has no `participant_cert` row is
rejected** — issue one directly from the Vault PKI role, bypassing enrollment, and confirm it is
refused. That is the mis-issuance case the database check exists for, and the one an earlier
fail-open rule would have admitted. **A cold pod reports unready and receives no traffic**, rather
than serving requests it cannot authorize. Rotation with
overlap succeeds without the DFSP changing its client. **With both endpoints live simultaneously**, a
request over the mTLS endpoint runs checks 1 and 2 while one over the legacy endpoint skips them and
increments the no-certificate counter — neither behaviour depends on `DFSP_FACING_MTLS`, which is set
only after the legacy endpoint is retired.

**Throughput** — benchmark PKCS#11 `C_Sign` against the cluster at the chosen algorithm before
committing. Size for 3–5× steady state, not average. Instrument the sign call separately from
end-to-end latency.

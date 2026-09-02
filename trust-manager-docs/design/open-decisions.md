# Open Decisions

Everything not yet settled in the trust-manager design, with a recommendation for each.

**How to use this file.** Each entry has a **Resolution** line, blank until decided. When one is
answered, fill it in, move a one-line summary into the Settled table in [`README.md`](../README.md),
and update whichever document the decision touches. Letters are stable identifiers — other documents
reference them inline, so **do not renumber**.

Decisions **A**, **M**, **D**, **K** and **F** are resolved and now live in the README as settled
decisions — A in favour of the design (12), M by project requirement (10), D against its own earlier
recommendation (19), and K with F together (23). D's entry is retained below in full, because the
reasoning that reversed it is worth keeping.

---

## Status

| Tier | | Items | Nature |
| --- | --- | --- | --- |
| **1** | ~~Blocking~~ — resolved 2026-09-02 | ~~**K**~~ | structural |
| **2** | Security behaviour — must be specified before build | **G, E, B, C** (~~F~~ resolved) | policy |
| **3** | Fact checks | **N, H, I** | lookup |
| **4** | Confirm with the client | **L, O** | confirmation |
| — | Deferred, with reason | **J** | optional capability |

**No open item can invalidate an architectural choice.** A was the only one that could, and it
resolved in favour of the design. With K settled, nothing blocks a document from being completed
either — what remains is security behaviour and fact-checking.

---

# Tier 1 — blocking

## K. Self-service or operator-mediated enrollment

**Question.** Can a DFSP's own authorized users upload a CSR and register an accessKey through the
portal, or does an operator do it on their behalf?

**Why it is open.** Self-service makes a portal login the root of trust for cryptographic identity.
That is defensible with DFSP-scoped IAM and step-up authentication, and reckless without.

**Recommendation.** Operator-mediated for this phase, self-service once DFSP-scoped IAM exists.
Settle together with **F** — they are the same authorization question.

**Blocks — now unblocked.** The portal scope for this phase, and the hedge in
[`dfsp-integration-impact.md`](../external/dfsp-integration-impact.md).

**Resolution — operator-mediated, 2026-09-02.** A DFSP sends its CSR to the hub operator, who
uploads it and returns the signed certificate and chain. Self-service is a later phase, once
DFSP-scoped IAM exists to carry it.

The deciding argument is the one this entry opened with: self-service makes a portal login the root
of trust for cryptographic identity, and DFSP-scoped IAM does not exist yet. Deferring costs an
operator step per DFSP — enrollment happens once per DFSP and again at renewal, so the volume is
low — and it removes the larger half of the phase.

---

# Tier 2 — security behaviour

## D. Cache-miss behaviour — fail open or closed — **RESOLVED: fail closed**

**Question.** A request arrives, and the certificate or key is not in the in-memory cache. Reject, or
allow?

**Why it was open.** The two failure modes look asymmetric: failing closed on a cold cache appears to
turn a pod restart into an outage, while failing open on a revoked credential defeats revocation. An
earlier draft recommended failing *open* on cache-cold or unknown, with an alarm.

**That recommendation was wrong, for two reasons.**

**It is not a security trade — it disables the control entirely.** Every check in
[`dfsp-facing-leg.md`](./dfsp-facing-leg.md) §4 needs the row: status comes from it, and the binding
rule compares `row.fsp_id` against `FSPIOP-Source`. With no row those checks are not relaxed, they
are *unrunnable* — which reproduces precisely the attack §3 exists to prevent: a leaked accessKey for
DFSP-B plus any CA-issued certificate transacts as DFSP-B. On the accessKey side it is worse still:
"fail open" there means accepting a request whose signature cannot be verified at all.

**The dilemma was false.** It only exists if a cold pod receives traffic. Gate readiness on the
initial cache load and Kubernetes routes nothing to a cold replica, so failing closed costs no
availability and there is nothing left to trade. The cold-cache problem is startup sequencing, not
authorization, and was being solved in the wrong layer.

"Unknown" is also rarely benign. Envoy has already rejected anything not chaining to Pivotal's CA, so
a zero-row lookup means a cold or partially-loaded cache, a purged row, an out-of-band issuance, a
**fingerprint-format mismatch** (open decision **I** — which would make every lookup miss, silently,
forever), or **mis-issuance from the software-held intermediate**. Fail-open is wrong for all of
them, and for the last two it hands the decision back to chain validation — the exact thing the
database check was added not to rely on.

**Resolution — four rules:**

| Condition | Behaviour |
| --- | --- |
| Row found, `status ∈ {active, retiring}` | proceed to the binding check |
| Row found, `status = revoked` | **reject** — a known answer, always closed |
| **No row after a bounded synchronous re-read** | **reject** |
| **Cache not yet loaded** | **report unready** — receive no traffic at all, rather than answering |

The synchronous re-read is the escape hatch for a genuinely new credential whose nudge has not
landed: on a miss, query the authoritative store once under a tight timeout before rejecting. It is
safe against abuse because Envoy has already bounded the space of presentable certificates to those
Pivotal's CA actually issued.

**Blocks — now unblocked.** The runtime check sequence in
[`dfsp-facing-leg.md`](./dfsp-facing-leg.md) §4, and the Phase 6 verification step.

---

## G. Replay protection

**Question.** What stops a captured `/secured/sendmoney` request being replayed?

**Why it is open.** **Nothing does today.** No nonce and no timestamp is bound into the accessKey
signature, so a captured request stays valid indefinitely. This is a genuine gap rather than an
underspecified detail, and it is the one most likely to be raised in a security review.

| Option | Client change | Notes |
| --- | --- | --- |
| **`homeTransactionId` uniqueness** | **none** | Enforce at the persistence layer, reject duplicates |
| Timestamp in the signed payload with a window | yes | Needs clock-skew tolerance, which reopens the window |
| Nonce store | yes | Strongest, but requires a shared store on the hot path |

**Recommendation.** `homeTransactionId` uniqueness — the only option requiring zero DFSP client
change, and it composes with the others if you tighten later.

**Blocks.** A uniqueness constraint in the schema and a rejection path in the guard.

**Resolution.** *(pending)*

---

## E. accessKey emergency revocation

**Question.** A DFSP reports its accessKey private key compromised. What happens?

**Why it is open.** Certificates have a no-overlap emergency path — status `revoked`, propagated
sub-second. The accessKey has only additive rotation with an overlap, so the compromised key stays
valid for the whole overlap window. The asymmetry is accidental, not designed.

**Recommendation.** Mirror the certificate path: an explicit revoke that sets status immediately with
no overlap, propagated by the same JetStream nudge, separate from normal rotation.

**Blocks.** The `participant_key` status lifecycle and the rotation section of
[`dfsp-facing-leg.md`](./dfsp-facing-leg.md) §1.

**Resolution.** *(pending)*

---

## B. What a connector does when its own tenant is revoked

**Question.** A `revoke` nudge arrives for the tenant a connector serves. It may have in-flight work.

**Why it is open.** Three plausible behaviours, with different failure modes: refuse and let
JetStream redeliver risks a poison-message loop until `MaxDeliver`; stopping silently strands
in-flight transfers.

**Recommendation.** Drain in-flight work, stop consuming, alarm. Avoids both the redelivery loop and
a silent stall, and leaves an operator in control of restart.

**Blocks.** The connector invalidation consumer — [`hub-facing-leg.md`](./hub-facing-leg.md) §A3.

**Resolution.** *(pending)*

---

## C. NATS authorization

**Question.** What scopes a connector's access to NATS subjects?

**Why it is open.** The request subjects are an injection path today — under every signing option,
anything that can publish to NATS can ask a connector to act. Trust nudges carry no key material, so
a forged nudge only causes a re-read, but **work** subjects are a different matter.

**Recommendation.** Subject-scoped credentials per connector: publish and subscribe rights limited to
that tenant's subjects. Independent of every other decision here, so it can be closed early.

**Blocks.** NATS account and credential provisioning; no document depends on it structurally.

**Resolution.** *(pending)*

---

## F. Who may replace an accessKey

**Question.** `participant.access-key.update` is `HUB`-scoped today. Should a DFSP be able to
register its own replacement key?

**Why it is open.** Same root-of-trust concern as **K**, on the key rather than the certificate.

**Recommendation.** Operator-mediated until DFSP-scoped IAM exists. Decide with **K**.

**Blocks — now unblocked.** The RBAC permission set and the portal scope.

**Resolution — operator-mediated, 2026-09-02.** Settled with **K**, as this entry always required:
they are the same authorization question. `participant.access-key.update` stays `HUB`-scoped. A DFSP
supplies its new public key to the hub operator, who registers it; rotation remains zero-downtime
for the DFSP either way, since the overlap is what makes that true, not who performs the upload.

---

# Tier 3 — fact checks

## N. Can a KMS custom key store hold `ECC_NIST_P256`? — **RESOLVED, moot**

**Closed by settled decision 3.** The question only mattered while FSPIOP JWS was ES256 and there was
a chance the KMS custom key store might have to carry the signing keys. Both premises are gone:

- signing is **RS256 (RSA-2048)**, so no EC key exists to store;
- the custom key store backs the **Vault seal** only (a symmetric key), never signing — settled
  decision 14 — and only in the HSM-backed profile.

Nothing in either profile depends on the answer. Retained as a record of why it was asked.


## H. Which CA chain the DFSP downloads

**Question.** What must a DFSP actually install?

**Why it is open.** Two different artifacts are being conflated. The chain the DFSP **presents** —
its client certificate's issuing chain — is settled. The chain the DFSP must **trust** to validate
Pivotal's *server* certificate may be nothing at all, if the DFSP-facing gateway uses a
publicly-trusted issuer.

**Action.** Confirm the DFSP-facing gateway's server-certificate issuer, then disambiguate the two in
[`dfsp-integration-impact.md`](../external/dfsp-integration-impact.md), which currently mentions only
`chain.pem` without saying which.

**Resolution.** *(pending)*

---

## I. Confirm the gateway exposes a usable client-cert fingerprint

**Question.** Can the gateway forward a fingerprint the application can key on?

**Why it is open.** The design keys `participant_cert` lookups on `fingerprint_sha256` because
Envoy's `set_current_client_cert_details` exposes `By`, `Hash`, `Subject`, `URI` and `Cert` — and
**no serial field**. That needs confirming against the product and version actually chosen.

**Dependency — blocked on picking the gateway.** Cannot be closed first.

**Action.** Verify the forwarded header's field set and that the hash is SHA-256 of the DER.

**Resolution.** *(pending)*

---

# Tier 4 — confirm with the client

## L. Is HSM custody of the CA *roots* sufficient?

**Question.** Both CA **root** keys live in CloudHSM. Does the in-HSM requirement also extend to the
**intermediate** (issuing) CA key?

**Pivotal's position — not yet confirmed.** Roots are sufficient. The root is the trust anchor
external parties install, and its compromise is unrecoverable without every DFSP reinstalling. An
intermediate can be revoked at the root and replaced without any relying party changing anything, so
its blast radius is bounded by design. HSM the root, keep the issuing CA operationally accessible, is
standard PKI practice rather than a concession — and the intermediate is further protected by Vault's
own access control, audit and short validity.

**If the client disagrees**, the fallback is an issuing CA that speaks PKCS#11 — **step-ca** (open
source, has a cert-manager issuer) or **Vault Enterprise Managed Keys** (licence). Nothing else in the
design changes.

**Blocks.** Whether Vault OSS PKI suffices. Currently assumed throughout as settled decision 13.

**Resolution.** *(Pivotal's position, pending client confirmation)*

---

## O. CloudHSM crypto-user provisioning and rotation

**Question.** How are crypto users created, scoped and rotated?

**Why it is open.** CloudHSM authenticates with a **username and password per crypto user**, not with
IAM policy, and those credentials are static. The claim in [`architecture.md`](./architecture.md) §3 —
*a compromised connector signs as one DFSP* — is only true if each connector has **its own** crypto
user owning only its tenant's key.

**Settled by the product's own model, not open:** the *ownership matrix*. Creation confers ownership
permanently, there is no transfer operation, and an owner always retains use rights — so each key is
generated as the tenant's own CU and then shared to web-outbound. See
[`architecture.md`](./architecture.md) §4.3, which also states the residual privilege this leaves
trust-manager. An earlier draft of that section described a "transfer ownership" step that does not
exist in CloudHSM; it has been corrected.

**Still open, and narrower than it was:** provisioning mechanics and rotation.

**Recommendation.** One CU per DFSP (owner, held by that tenant's connector), one for web-outbound
(owner of nothing, every key shared to it), and one for trust-manager (owner of nothing). Credentials
delivered through Vault KV at the paths in [`implementation-plan.md`](../implementation/implementation-plan.md)
§1.2.1 — note that web-outbound needs **one** credential and *N* references, so credential and
`keyRef` do not share a path.

Two things to settle before build:

- **Rotation procedure.** CU passwords do not expire on their own, so rotation is an operational
  runbook rather than a schedule. Decide the cadence and who executes it.
- **Whether the residual privilege is acceptable.** Because onboarding is a single portal action,
  trust-manager sets each tenant CU's password and can therefore re-authenticate as it. §4.3 accepts
  this and compensates with an alarm on any `C_Sign` by `cu-trust-manager` — legitimately always
  zero. The alternative is a two-party onboarding step where an operator holds the CU secret out of
  band; it costs a manual step per DFSP and closes only one of two impersonation paths.

**Blocks.** Nothing structurally, but retrofitting per-tenant crypto users across every connector
later is painful, so agree it before build.

**Resolution.** *(pending)*

---

# Deferred

## J. Do remote-signing tenants fall back to delegated signing?

**Question.** A tenant insists on holding its own scheme identity in its own KMS. Does its connector
get that tenant's cloud credentials, or does it delegate to a central signing service?

**Why deferred.** An optional capability no tenant has asked for. `KEY_PROVIDER` is already
per-tenant, so the hook exists.

**Recommendation when it arises.** Delegate. Keeping third-party cloud credentials in one service is
far better than distributing them to every connector.

**Resolution.** *(deferred — no tenant has requested it)*

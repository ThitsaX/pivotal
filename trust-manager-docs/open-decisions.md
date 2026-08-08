# Open Decisions

Everything not yet settled in the trust-manager design, with a recommendation for each.

**How to use this file.** Each entry has a **Resolution** line, blank until decided. When one is
answered, fill it in, move a one-line summary into the Settled table in [`README.md`](./README.md),
and update whichever document the decision touches. Letters are stable identifiers — other documents
reference them inline, so **do not renumber**.

Decisions **A** and **M** are resolved and now live in the README as settled decisions — A in favour
of the design (12), M by project requirement (10).

---

## Status

| Tier | | Items | Nature |
| --- | --- | --- | --- |
| **1** | Blocking — documents cannot be completed | **K** | structural |
| **2** | Security behaviour — must be specified before build | **D, G, E, B, C, F** | policy |
| **3** | Fact checks | **N, H, I** | lookup |
| **4** | Confirm with the client | **L, O** | confirmation |
| — | Deferred, with reason | **J** | optional capability |

**No open item can invalidate an architectural choice.** A was the only one that could, and it
resolved in favour of the design. The design is structurally committed.

---

# Tier 1 — blocking

## K. Self-service or operator-mediated enrollment

**Question.** Can a DFSP's own authorized users upload a CSR and register an accessKey through the
portal, or does an operator do it on their behalf?

**Why it is open.** Self-service makes a portal login the root of trust for cryptographic identity.
That is defensible with DFSP-scoped IAM and step-up authentication, and reckless without.

**Recommendation.** Operator-mediated for this phase, self-service once DFSP-scoped IAM exists.
Settle together with **F** — they are the same authorization question.

**Blocks.** Whether the portal and DFSP-scoped IAM are in this phase. Also leaking into
[`dfsp-integration-impact.md`](./dfsp-integration-impact.md), which currently hedges *"through the
portal, or to the hub operator where enrollment is operator-mediated"* — that hedge must resolve
before the document goes to external parties.

**Resolution.** *(pending)*

---

# Tier 2 — security behaviour

## D. Cache-miss behaviour — fail open or closed

**Question.** A request arrives, and the certificate or key is not in the in-memory cache. Reject, or
allow?

**Why it is open.** The two failure modes are not symmetric. Failing closed on a cold cache turns a
pod restart into an outage. Failing open on a revoked credential defeats revocation.

**Recommendation.** **Fail open on cache-cold or unknown, with an alarm. Fail closed on
known-and-revoked.** Availability where you have no information, safety where you do. The alarm
matters as much as the rule — a silent fail-open is indistinguishable from working.

**Blocks.** The runtime check sequence in [`dfsp-facing-leg.md`](./dfsp-facing-leg.md) §4, and the
Phase 6 verification step.

**Resolution.** *(pending)*

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

**Blocks.** The RBAC permission set and the portal scope.

**Resolution.** *(pending)*

---

# Tier 3 — fact checks

## N. Can a KMS custom key store hold `ECC_NIST_P256`?

**Question.** Do AWS KMS custom key stores support asymmetric EC keys?

**Why it matters.** The project requirement names *AWS CloudHSM integrated with an AWS KMS custom key
store*.
Custom key stores have historically been limited to **symmetric** keys. If that still holds, the
prescribed mechanism cannot hold the per-DFSP JWS signing keys at all, and **PKCS#11-direct to the
same cluster becomes the only working path** — not merely the cheaper one.

Either way the in-HSM requirement is satisfied: CloudHSM is a cloud-hosted dedicated HSM and
operations are performed within it. The custom key store wording is a narrowing that may simply not
fit asymmetric signing.

**Action.** Verify against current AWS documentation early, and carry the answer into the
application-layer-key discussion with the client.

**Resolution.** *(pending)*

---

## H. Which CA chain the DFSP downloads

**Question.** What must a DFSP actually install?

**Why it is open.** Two different artifacts are being conflated. The chain the DFSP **presents** —
its client certificate's issuing chain — is settled. The chain the DFSP must **trust** to validate
Pivotal's *server* certificate may be nothing at all, if the DFSP-facing gateway uses a
publicly-trusted issuer.

**Action.** Confirm the DFSP-facing gateway's server-certificate issuer, then disambiguate the two in
[`dfsp-integration-impact.md`](./dfsp-integration-impact.md), which currently mentions only
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
IAM policy. Per-key isolation comes from key ownership and sharing between crypto users. The claim in
[`architecture.md`](./architecture.md) §3 — *a compromised connector signs as one DFSP* — is only
true if each connector has **its own** crypto user owning only its tenant's key.

**Recommendation.** One CU per connector plus one for web-outbound, credentials delivered through
Vault KV alongside the `keyRef`. Rotation is an operational procedure, since the credentials do not
expire on their own.

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

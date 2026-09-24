# Open Decisions

Everything not yet settled in the trust-manager design, with a recommendation for each.

**How to use this file.** Each entry has a **Resolution** line, blank until decided. When one is
answered, fill it in, move a one-line summary into the Settled table in [`README.md`](../README.md),
and update whichever document the decision touches. Letters are stable identifiers — other documents
reference them inline, so **do not renumber**.

Decisions **A**, **M**, **D**, **K**, **F**, **O**, **P** and **L** are resolved and now live in the
README as settled decisions — A in favour of the design (12), M by project requirement (10), D against its
own earlier recommendation (19), K with F together (23), O in favour of full automation with a
corrected alarm (24), and P deferring intermediate-CA rotation to a runbook (25). D's entry is
retained below in full, because the reasoning that reversed it is worth keeping.

---

## Status

| Tier | | Items | Nature |
| --- | --- | --- | --- |
| **1** | ~~Blocking~~ — resolved 2026-09-02 | ~~**K**~~ | structural |
| **2** | Security behaviour — must be specified before build | **G, E, B, C** (~~F~~ resolved) | policy |
| **3** | Fact checks | **N, H, I** | lookup |
| **4** | ~~Confirm with the client~~ — resolved 2026-09-18 | ~~**L**~~, ~~**O**~~ | confirmation |
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

## L. Is HSM custody of the CA *roots* sufficient? — **RESOLVED: yes, roots only**

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

**Resolution — roots only; the intermediates stay in Vault. 2026-09-18.** Confirmed against the
governing requirements rather than argued from PKI convention, which is what changed. The case rests
on the structure of the requirements themselves:

- **R6 is the PKI requirement, and it never mentions HSMs.** It mandates issuance, renewal,
  revocation, revocation status verifiable at authentication time, and a unique certificate per
  participant. Certificate authorities are governed there, and hardware custody is not among its
  terms.
- **R5 shows the drafters write "within the HSM" when they mean it.** That phrase appears explicitly,
  about the key lifecycle. Its absence from R6 is a choice rather than an omission.
- **R1 defers the boundary by name.** It closes by requiring that the treatment of *application-layer
  keys* be confirmed during the inception phase — so stating the scope is expected, not presumptuous.

The position taken: **application-layer keys are the per-DFSP FSPIOP JWS signing keys**, and those go
in CloudHSM. **CA keys are PKI infrastructure** governed by R6 — roots in the HSM, intermediates in
Vault PKI, leaves issued by Vault and cert-manager.

The earlier revocability argument above is **not** the basis for this, and should not be quoted as
one: it assumed a CRL that relying parties read, and nothing in the deployment checks a CRL — no
gateway, chart or Java trust store — while no Vault PKI role sets `crl_distribution_points`. The
durable arguments are blast radius, Vault's own access control and audit, short leaf validity, and
for the DFSP-facing domain the fingerprint binding that makes a forged certificate useless without a
matching `participant_cert` row.

**What the alternative would have cost**, recorded so the decision is legible later: Vault OSS has no
HSM integration and Managed Keys is an Enterprise feature, so an in-hardware intermediate means
replacing Vault PKI with step-ca over PKCS#11 or buying Enterprise — touching both `ClusterIssuer`s,
`DfspCertificateIssuer`, the `use_csr_common_name=false` hardening and `DfspCaPublishScheduler`.
Volume was never the obstacle: DFSP certificates are one per participant per year and workload
certificates are 90-day for a handful of workloads.

---

## O. CloudHSM crypto-user provisioning and rotation — **RESOLVED: trust-manager provisions, alarm on Crypto Officer operations**

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
  trust-manager sets each tenant CU's password and can therefore re-authenticate as it. The
  alternative is a two-party onboarding step where an operator holds the CU secret out of band; it
  costs a manual step per DFSP and closes only one of two impersonation paths. *(Written before the
  resolution below, which took that alternative for reasons this paragraph does not consider —
  R7 and R8. The `C_Sign` by `cu-trust-manager` alarm it referred to is retired.)*

**Blocks.** Nothing structurally, but retrofitting per-tenant crypto users across every connector
later is painful, so agree it before build.

**Resolution — a custodian holds the Crypto Officer credential, 2026-09-20.**

> **This amends an earlier resolution of 2026-09-18**, which gave the Crypto Officer credential to
> trust-manager so that onboarding stayed a single portal action. That version was taken on security
> grounds alone, where the operator-mediated alternative looked marginal. Reading **R7** (separation
> of duties, naming key management) and **R8** (maker-checker for critical configuration changes)
> changed the calculation: one service holding both user administration and key generation is the
> shape R7 exists to prevent, and a single click is not maker-checker. The original reasoning is kept
> below because the argument it lost to is worth seeing.

**No service holds a Crypto Officer credential.** It stays with named custodians and enters no
service, no environment variable, and not Vault. A custodian creates `cu-<fspId>` in a scheduled
session; the script then writes that crypto user's own password to Vault, where trust-manager reads
it.

**Generation and sharing stay automated.** Both are crypto-user operations, so trust-manager performs
them with the credential it reads from Vault. Only *creating* the user needs a Crypto Officer. The
cost is therefore one short human step per onboarding and per offboarding — not a manual onboarding —
and it lands on a path that already has a manual prerequisite in MCM registration, which is already
the first step.

**What this closes.** trust-manager can no longer create a crypto user or reset one's password. It
cannot mint a new identity, and it cannot take over a tenant whose credential it was never given.

**What remains, and it must not be described as closed.** trust-manager reads every tenant's CU
credential from Vault in order to generate that tenant's key, so it can authenticate as any tenant it
has provisioned and sign as them. The ownership rule above makes that unavoidable: whoever generates
must hold the owner's credential. The compensating control moves from the HSM to **Vault's audit log**
— every credential read is recorded, so a read of `hsmcred/*` outside a provisioning or rotation
window is the anomaly worth alarming on.

**`cu-trust-manager` is not created.** Under this model nothing ever authenticates as it, so the user
and its zero-threshold `C_Sign` alarm would watch nothing. The alarms that do work are Crypto Officer
operations and the Vault reads above.

*The original resolution's reasoning, retained:* having an operator create the crypto users "closes
almost nothing, because the ownership rule forces trust-manager to hold the tenant CU password in
order to generate at all." That remains **true** — and is exactly why the residual above is stated
rather than claimed closed. What the earlier reading missed is that it is not the only thing at
stake: user administration is a separate privilege from key use, and R7 is about who may hold it.
Having **the connector** generate its own key was also considered and still rejected — it puts a
control-plane operation in the data plane, and leaves open the path where a compromised trust-manager
mints a fresh key, repoints the `keyRef` and publishes the new public key to MCM without touching a
crypto user at all.

**Why a Crypto Officer alarm, and not a signing alarm.** Creating a crypto user requires the Crypto
Officer role, and a Crypto Officer can also reset the password of an *existing* crypto user — so the
cheapest impersonation would be to reset `cu-<fspId>`, log in as it, and sign. The audit record then
reads `C_Sign` by that tenant's own crypto user, indistinguishable from its connector's normal
traffic. No signing alarm can see that. An alarm on `user create` and `user change-password` can,
because under this decision those occur only inside a scheduled custodian session.

**Rotation is an operational runbook, and it does not reduce the residual privilege** — trust-manager
would generate the replacement credential too. Set the cadence with whoever will execute it; there is
no expiry forcing the schedule.

**The residual is accepted and named**, not claimed closed: trust-manager can sign as any tenant it
has provisioned, because generating requires the owner's credential. Vault's audit log is what covers
it.

**One thing to verify before build.** The role model above — that a Crypto Officer can reset another
user's password — is taken from CloudHSM's documented user roles rather than from a test against the
cluster. Confirm it against the CloudHSM CLI version being deployed, because the choice of alarm rests
on it.

---

## P. Is intermediate-CA rotation a built feature or a runbook? — **RESOLVED: runbook, deferred**

**Question.** When an intermediate CA has to be replaced — on expiry, or because its key was
compromised — is that an operator-driven workflow in the portal, or a manual procedure?

**Why it came up.** A portal "revoke intermediate" action was sketched and rejected on inspection:
revoking alone strands the system, because every leaf under that intermediate becomes untrusted and
nothing reissues them. The correct operation is *rotate* — new intermediate, reissue the leaves,
distribute both anchors, and only then revoke — with revocation as the last step rather than the
first. That is a stateful five-stage workflow, not a button, and two of its stages cannot be
automated at all: signing the new intermediate needs the root key, which no Pivotal workload may
reach, and re-enrolling DFSP leaves needs one CSR exchange per DFSP at human speed.

**Resolution — runbook, deferred, 2026-09-18.** Rotation is performed manually if it occurs. No
portal screens, no rotation state machine in trust-manager, no CRL publisher.

Four things make this safe rather than merely cheap:

- **The event is rare and not clock-driven.** The ceremony issues each intermediate with a **5-year**
  validity (`kms/setup/scripts/ceremony-kms.js` — 1825 days, under a 10-year root), so this will not arrive
  during the HSM-backed delivery or the year after it. Rotation is triggered by a decision, not by a
  schedule.
- **Every mechanical piece already exists.** The ceremony script signs the intermediate and already
  signs a root CRL; Vault has `pki/intermediate/set-signed`; `DfspCaPublishScheduler` distributes the
  anchor; cert-manager reissues the hub-client leaves unprompted. A manual rotation is running a
  runbook, not building a feature.
- **It matches decision 23.** Certificate enrollment is already operator-mediated, so an
  operator-mediated rotation is consistent with the DFSP-facing model rather than an exception to it.
- **It is the opposite case to leaf renewal.** Leaves expire on a 90-day clock whether or not anyone
  remembers, which is why cert-manager must be real automation at launch. A 5-year intermediate does
  not have that property.

**Two obligations this creates**, and they are the price of the deferral:

1. **Write the rotation runbook while the ceremony tooling is fresh** — the same argument
   [`implementation-plan.md`](../implementation/implementation-plan.md) §1.3 already makes for
   building root CRL signing into the ceremony script rather than discovering it during an incident.
   It must state the anchor **overlap**: both intermediates trusted while leaves are replaced, the
   old anchor removed only once re-enrollment is complete. Closing that window early breaks every
   peer that has not moved; leaving it open means a stolen key still works.
2. **Put the intermediate's expiry somewhere that will shout.** Five years is longer than the tenure
   of the people who built this, and expiry alerting is absent (phase 7). A calendar entry suffices
   for now; the phase-7 ladder should cover it when it lands.

**Accepted risk, stated rather than implied.** In a genuine key compromise, manual rotation on the
DFSP-facing side is a multi-week campaign with no tooling behind it. What makes that tolerable is
that a stolen `pki_dfsp` intermediate is **not immediately exploitable**: a forged certificate's
fingerprint matches no `participant_cert` row, so `DfspCertificateGuard` refuses it (decision 8).
The hub-facing domain has no equivalent cushion, which is a further argument for the source-scoped
AuthorizationPolicy already drafted for that host.

**A CRL would need a consumer first.** Nothing in the deployment checks a CRL — no gateway, chart or
Java trust store — and no Vault PKI role sets `crl_distribution_points`, so issued certificates carry
no URL to fetch one from. Until that changes, revocation of an intermediate means replacing the
anchor, and a CRL is a record for auditors rather than an enforced control. Note this does **not**
affect DFSP certificate revocation, which takes effect immediately through the `participant_cert`
status check on every request and needs no CRL at all.

**Resolution.** *Runbook, deferred — 2026-09-18. Recorded as settled decision 25.*

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

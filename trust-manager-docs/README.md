# Trust-Manager — Design

Pivotal is a multi-tenant payment adapter fronting many DFSPs to a Mojaloop Hub. **trust-manager**
is the control plane that manages the cryptographic identity of those DFSPs: key generation and
custody, certificate issuance and lifecycle, and registry sync with the Hub.

**Driver:** deployments require Mojaloop security standards (FSPIOP JWS + mTLS) on all connections.
Today the Hub-facing leg has **neither** — `FSPIOP_USE_JWS=false` everywhere and plain in-cluster
HTTP — and the DFSP-facing leg has accessKey JWS over a VPN with private keys stored as plaintext
PEM in MySQL.

**Two deployment profiles.** The **HSM-backed** profile serves deployments that mandate a dedicated
HSM for private-key storage; the **KMS-backed** profile serves those that do not. The difference is
confined to one axis — where the JWS private key lives and therefore where signing happens — and is
expressed as `KEY_PROVIDER`, not as a fork. Both are sized for **80–100 TPS** and both sign
**RS256 (RSA-2048)**. See [`architecture.md`](./design/architecture.md) §0.

---

## Documents

```
trust-manager-docs/
├── design/            the model and the arguments — read once, agree, revisit rarely
├── implementation/    what to build — read constantly while coding
├── runbooks/          what to type — phase 0 only, then archived
└── external/          written for people outside Pivotal
```

### design/ — decide

| Document | Contents |
| --- | --- |
| [`architecture.md`](./design/architecture.md) | The conceptual model — profiles, legs, components, key inventory, custody, trust domains, propagation |
| [`hub-facing-leg.md`](./design/hub-facing-leg.md) | FSPIOP JWS and Hub mTLS: protected-header spec, signing paths, certificate model, MCM integration |
| [`dfsp-facing-leg.md`](./design/dfsp-facing-leg.md) | accessKey and DFSP mTLS: enrollment, rotation, runtime checks, lifecycle |
| [`open-decisions.md`](./design/open-decisions.md) | Everything not yet settled, with options and a recommendation for each |

### implementation/ — build

**This is the working set.** If you are writing code, these two plus the leg specs above are what you
need; `architecture.md` is reference-when-stuck rather than a daily read.

| Document | Contents |
| --- | --- |
| [`implementation-plan.md`](./implementation/implementation-plan.md) | The spine — platform requirements, schema, per-service changes, phasing, verification |
| [`pki-issuance-flows.md`](./implementation/pki-issuance-flows.md) | Certificate mechanics — the root ceremony, the Vault PKI intermediate, both leaf-issuance paths, and where the material is stored |

### runbooks/ — run

| Document | Contents |
| --- | --- |
| [`ceremony-kms.md`](./runbooks/ceremony-kms.md) | Bringing up **both** CA trust domains in the KMS-backed profile, with commands |
| [`ceremony-local.md`](./runbooks/ceremony-local.md) | The same ceremony against SoftHSM2 and Vault in Docker, for local development and CI |

### external/ — share

| Document | Contents |
| --- | --- |
| [`dfsp-integration-impact.md`](./external/dfsp-integration-impact.md) | What each DFSP must do — written for external distribution |
| [`pivotal-e2e-flow.svg`](./external/pivotal-e2e-flow.svg) | End-to-end flow diagram |

---

**Reading order.** Start with [`architecture.md`](./design/architecture.md) §0, which defines the two
deployment profiles that everything else is scoped against. The two leg documents are independent of
each other and can be read in either order. `implementation-plan.md` assumes both.

---

## Core invariants

These hold everywhere in this design. Anything contradicting them is a bug in the document.

- **trust-manager is a control plane.** It never sits on the transaction path. It provisions material
  into stores that the data plane reads. It **generates** keys in the HSM; it never **signs** with
  them.
- **The data plane never calls trust-manager.** It reads its stores, is *nudged* by JetStream, and is
  backstopped by a reconcile poll.
- **One store per value.** Prefer a single authoritative store over a source plus a projection — a
  value written to two stores without a transaction can diverge permanently, and a reconciler is a
  worse answer than not having the second copy.
- **Private keys never leave their custodian.** Under `pkcs11` (HSM-backed) signing is delegated and the
  data plane holds a `keyRef`, never key material. Under `vault-kv` (KMS-backed) Vault KV *is* the
  custodian and the key is read into process memory at startup — see `architecture.md` §4.8.
- **CloudHSM, MySQL and Vault are the sources of truth.** JetStream carries invalidation nudges only,
  never key material. A forged nudge can at worst cause a re-read.
- **Publish after commit**, never before.
- **Rotation is additive with an overlap.** Old material goes `active → retiring`, not deleted, so
  rotation is zero-downtime. **Revocation is a separate, immediate path with no overlap.**
- **One FSPIOP JWS keypair per FSP**, used by whichever Pivotal component acts for that FSP.
- **Signing operations happen inside the HSM — in the HSM-backed profile.** There, no component holds a
  private key in memory. In KMS-backed signing is in-process from a Vault-KV-sourced key.
- **Vault is never on the signing path, in either profile.** It is read once at startup and cached,
  so Vault can be down and payments continue. This is why **Vault Transit is not used** — it would
  put an HTTP round trip on every signature and make Vault a hard runtime dependency.

---

## Decision register

### Settled

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | **`connector → payee FSP` is out of scope** | The FSP is its own CA, provisioning is manual, Pivotal holds no key material there |
| 2 | **accessKey rotation uses try-both, not `kid`** | `kid` is a contract change for every DFSP and makes rotation *more* fragile client-side; the saving is ~50µs of local CPU |
| 3 | **RS256 (RSA-2048) on both legs** — FSPIOP JWS *and* the accessKey | **Reverses an earlier ES256 decision.** ES256 was chosen for signing cost at 600–1,200 signs/sec; at the agreed **80–100 TPS** the load is 480–600/s, which RS256 clears on either backend, so the performance case evaporated. What remains is compatibility: ES256 depends on every peer's `sdk-standard-components` version and makes MCM flag every key `INVALID` (its validator is RSA-only). RS256 removes both external unknowns. RSA-2048 is the Mojaloop norm — `hub-facing-leg.md` §A1 |
| 4 | **Connectors sign remotely via an opaque keyRef**, never holding key material | Key never leaves the HSM, no per-connector key migration, narrower NATS blast radius than the alternatives |
| 5 | **One Pivotal mTLS identity to the Hub, not per-DFSP** | FSP identity is carried by JWS; per-tenant certs would force per-tenant connection pools for no gain |
| 6 | **Register the CA with MCM, not the leaf** | Leaf renewal then needs no MCM interaction, and any number of per-workload leaves become possible |
| 7 | **Uniform enforcement, no per-tenant exception flag** | Enforcement stays at the transport layer (Envoy `MUTUAL` on the mTLS endpoint); migration is by parallel endpoint. `DFSP_FACING_MTLS` requires XFCC once migration is done — it does **not** gate the certificate checks, which key on XFCC presence per request. `architecture.md` §6.1 |
| 8 | **Cert identity is bound to `FSPIOP-Source`** | Without it a leaked accessKey plus *any* tenant's certificate is enough to transact as the victim |
| 9 | **Migration uses a parallel mTLS endpoint** | Per-tenant pace without a flag day and without app-layer enforcement |
| 10 | **AWS CloudHSM via PKCS#11 holds all FSPIOP signing keys and both CA roots — *HSM-backed profile only*** | R1–R3 mandate operations *performed within* **dedicated** HSMs and name CloudHSM. PKCS#11-direct avoids KMS per-request charges and keeps the deferred on-premise migration to a config change. A deployment with no such requirement runs the **KMS-backed** profile instead — `architecture.md` §0, §4 |
| 11 | **`keyRef` is opaque and version-inclusive — rotation always mints a new one** | Key-version semantics differ irreconcilably across providers, and "sign with latest" silently breaks every peer |
| 12 | **The Hub does *not* map client cert → FSP identity; identity comes from `FSPIOP-Source`** | Verified against Mojaloop chart **v17.2.0** — no `auth-tls` / `ssl-client` / `verify-client` / `xfcc` anywhere in the tree, FSPIOP ingress templates are stock Bitnami-common with server-side TLS only. Confirms decisions 5 and 6. See [`hub-facing-leg.md`](./design/hub-facing-leg.md) §B2 |
| 13 | **Vault OSS PKI is the CA — intermediates in software, roots in a key service** | Roots live in CloudHSM (HSM-backed) or AWS KMS (KMS-backed); the **intermediate is software in both**, so every issued certificate comes from Vault PKI either way. **Neither CloudHSM nor KMS is a CA** — both only sign a digest, and the ceremony script builds the X.509, which is why Vault never needs any HSM or KMS integration. **No Enterprise licence, no step-ca, no new components** — `implementation-plan.md` §1.3 |
| 14 | **Vault seal: KMS custom key store → CloudHSM when HSM-backed, plain AWS KMS when KMS-backed** | R3 names the CloudHSM-plus-custom-key-store integration, and the HSM-backed cluster already exists for signing, so the custom key store is a marginal add-on that satisfies the wording literally. The KMS-backed profile funds no cluster, and a custom key store requires one — plain KMS auto-unseal on Vault OSS is the correct choice there. **Neither seal makes signing an in-HSM operation**; the seal is touched roughly once per Vault process start |
| 15 | **Vault is not on the signing path in either profile; it is a key custodian only in the KMS-backed profile** | Under `pkcs11`, compromising Vault yields the ability to *ask* the HSM to sign while access lasts, not a private key — that is what the in-HSM requirement buys. Under `vault-kv`, Vault holds the key, but is still read once at startup and cached, so it never enters the transaction path — `architecture.md` §4.8 |
| 16 | **Two deployment profiles: HSM-backed (`pkcs11`) and KMS-backed (`vault-kv`)** | `KEY_PROVIDER` makes this a configuration, not a fork. Only the HSM-backed profile satisfies R1/R2/R3. The KMS-backed profile gets KMS-rooted CAs, a plain-KMS seal and in-process signing, and that lower assurance tier should be **stated and accepted**, not inferred from a config value — the absence of a stated requirement is not the same as agreement — `architecture.md` §0, §4.8 |
| 17 | **`keyRef` is authoritative in Vault KV, mirrored to MySQL** | One store per value. An earlier draft made MySQL authoritative and projected into KV, which put one value in two stores under a non-transactional double write — `architecture.md` §5.1 |
| 18 | **Each JWS key is generated as the tenant's own CU, then shared to web-outbound — *HSM-backed only*** | CloudHSM confers ownership at creation with **no transfer operation**, and an owner keeps use rights forever — so the creating CU can always sign. Generating as the tenant is the only way per-tenant isolation holds. trust-manager retains a residual ability to re-authenticate as any tenant CU; that is accepted and covered by an alarm rather than removed — `architecture.md` §4.3 |
| 19 | **Cache miss fails closed; a cold pod reports unready** | With no row the status and binding checks are *unrunnable*, not merely relaxed — fail-open reproduces the attack decision 8 exists to prevent. The apparent availability cost was a false dilemma: readiness gating means a cold replica receives no traffic, so failing closed costs nothing. Reverses an earlier recommendation — `open-decisions.md` **D** |
| 20 | **Vault Transit is not used, in either profile** | It is software custody *plus* an HTTP round trip per signature — slower than in-process signing and no more compliant than it. It would also make Vault a hard runtime dependency at `TPS × 6`, where today Vault is read once at startup and cached. `vault-kv` dominates it on performance, availability and simplicity alike — `architecture.md` §0, §4.6 |
| 21 | **Existing `participant.jws_private_key` values are regenerated, not migrated** | RS256 makes migration *technically* possible for the first time — the existing keys are already RSA, so unlike the ES256 plan they could be moved rather than replaced. They are still regenerated, because **they have been sitting in plaintext in MySQL** and must be treated as compromised. Regeneration is free before phase 4's first MCM publish and a coordinated break after it, so this must complete in phase 1 — `hub-facing-leg.md` §A3.1 |
| 22 | **The KMS-backed profile roots its CAs in a non-exportable AWS KMS key, not an air-gapped machine** | **Replaces an earlier offline-root decision.** The operational objection to an air-gapped machine is decisive: the root would be generated on someone's laptop and carried to production. A KMS key is created inside the service and has no export API, so no key material ever touches a human's machine — and it adds IAM scoping and a per-signature CloudTrail record, neither of which an offline machine has. What it gives up is **dedication**: KMS is multi-tenant, so this variant cannot be used where R1/R2 apply. Requires a separate key per trust domain, a third key for the Vault seal, and a zero-threshold `kms:Sign` alarm — `implementation-plan.md` §1.3 |

**Consequence of 12:** Hub-facing mTLS is **additive**. The Hub performs no client-certificate
verification today, so enabling it is a coordinated, out-of-band change by the Hub operator with a
lead time — see §B3.

### Open

| # | Question | Blocks |
| --- | --- | --- |
| B | **What does a connector do on `revoke` for its tenant?** | Refuse and let JetStream redeliver, fail loudly, or drain then stop |
| C | **NATS authorization** — scope and approach | The request subjects are an injection path today, under every signing option |
| E | **accessKey emergency revocation** | Certificates have a no-overlap emergency path; the accessKey does not |
| F | **Who may replace an accessKey** | `participant.access-key.update` is `HUB`-scoped today; self-service makes a portal login the root of trust |
| G | **Replay protection** | No nonce or timestamp is bound into the accessKey signature. `homeTransactionId` uniqueness is the zero-client-change alternative |
| H | **Which CA chain the DFSP downloads** | Pivotal's gateways currently use a publicly-trusted issuer, so possibly nothing needs installing |
| I | **Confirm the XFCC field** carries a usable fingerprint | Envoy exposes `Hash`, not a serial |
| J | **Remote-signing tenants fall back to delegated signing?** | Keeps external cloud credentials in one service rather than in every connector |
| K | **Self-service vs operator-mediated enrollment** | Determines whether portal and DFSP-scoped IAM are in this phase |
| L | **Confirm that HSM custody of the CA *roots* is sufficient** | Pivotal's position, not yet confirmed with the client. If the **intermediate** must also be in the HSM, the fallback is step-ca via PKCS#11 or Vault Enterprise Managed Keys. Everything else is unaffected |

| O | **CloudHSM crypto-user provisioning and rotation** | CU credentials are static, not IAM-scoped. One CU per connector is what keeps per-tenant isolation true |

Full context, options and a recommendation for each are in
**[`open-decisions.md`](./design/open-decisions.md)**, grouped by what closing them unblocks:

| Tier | Items | Nature |
| --- | --- | --- |
| **1** — blocking, documents cannot be completed | **K** enrollment model | structural |
| **2** — security behaviour, specify before build | **G** replay · **E** accessKey revocation · **B** connector on revoke · **C** NATS authz · **F** accessKey authority | policy |
| **3** — fact checks | **H** DFSP CA chain · **I** gateway fingerprint field | lookup |
| **confirm with the client** | **L** intermediate-in-HSM scope · **O** crypto-user model | confirmation |
| deferred | **J** remote-signing fallback | optional |

**No open item can now invalidate an architectural choice.** A — the only one that could — resolved
in favour of the design (decision 12). The design is structurally committed.

# Trust-Manager — Design

Pivotal is a multi-tenant payment adapter fronting many DFSPs to a Mojaloop Hub. **trust-manager**
is the control plane that manages the cryptographic identity of those DFSPs: key generation and
custody, certificate issuance and lifecycle, and registry sync with the Hub.

**Driver:** the client requires Mojaloop security standards (FSPIOP JWS + mTLS) on all connections.
Today the Hub-facing leg has **neither** — `FSPIOP_USE_JWS=false` everywhere and plain in-cluster
HTTP — and the DFSP-facing leg has accessKey JWS over a VPN with private keys stored as plaintext
PEM in MySQL.

---

## Documents

| Document | Contents |
| --- | --- |
| [`architecture.md`](./architecture.md) | The conceptual model — legs, components, complete key inventory, custody, trust domains, propagation |
| [`dfsp-facing-leg.md`](./dfsp-facing-leg.md) | accessKey and DFSP mTLS: enrollment, rotation, runtime checks, lifecycle |
| [`hub-facing-leg.md`](./hub-facing-leg.md) | FSPIOP JWS and Hub mTLS: protected-header spec, signing paths, certificate model, MCM integration |
| [`implementation-plan.md`](./implementation-plan.md) | Schema, per-service changes, infrastructure prerequisites, phasing, verification |
| [`open-decisions.md`](./open-decisions.md) | Everything not yet settled, with options and a recommendation for each |
| [`dfsp-integration-impact.md`](./dfsp-integration-impact.md) | What each DFSP must do — written for external distribution |

Start with `architecture.md`. The two leg documents are independent of each other and can be read in
either order.

`_superseded/` holds the previous three-document set, retained only until this version is accepted.

---

## Core invariants

These hold everywhere in this design. Anything contradicting them is a bug in the document.

- **trust-manager is a control plane.** It never sits on the transaction path. It provisions material
  into stores that the data plane reads.
- **The data plane never calls trust-manager.** It reads its stores, is *nudged* by JetStream, and is
  backstopped by a reconcile poll.
- **Private keys never leave their custodian.** Signing is delegated — the data plane holds a
  `keyRef`, never key material.
- **CloudHSM, MySQL and Vault are the sources of truth.** JetStream carries invalidation nudges only,
  never key material. A forged nudge can at worst cause a re-read.
- **Publish after commit**, never before.
- **Rotation is additive with an overlap.** Old material goes `active → retiring`, not deleted, so
  rotation is zero-downtime. **Revocation is a separate, immediate path with no overlap.**
- **One FSPIOP JWS keypair per FSP**, used by whichever Pivotal component acts for that FSP.
- **Signing operations happen inside the HSM.** No component holds a private key in memory, and Vault
  is not on the signing path.

---

## Decision register

### Settled

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | **`connector → payee FSP` is out of scope** | The FSP is its own CA, provisioning is manual, Pivotal holds no key material there |
| 2 | **accessKey rotation uses try-both, not `kid`** | `kid` is a contract change for every DFSP and makes rotation *more* fragile client-side; the saving is ~50µs of local CPU |
| 3 | **ES256 (ECDSA P-256) for FSPIOP JWS** | ~10× cheaper to sign than RS256 at 600–1,200 signs/sec; `sdk-standard-components` accepts `['RS256','ES256']` |
| 4 | **Connectors sign remotely via an opaque keyRef**, never holding key material | Key never leaves the HSM, no per-connector key migration, narrower NATS blast radius than the alternatives |
| 5 | **One Pivotal mTLS identity to the Hub, not per-DFSP** | FSP identity is carried by JWS; per-tenant certs would force per-tenant connection pools for no gain |
| 6 | **Register the CA with MCM, not the leaf** | Leaf renewal then needs no MCM interaction, and any number of per-workload leaves become possible |
| 7 | **`DFSP_FACING_MTLS` is a single global switch with uniform enforcement** | Enforcement stays at the transport layer (Envoy `REQUIRE`); no permanent per-tenant exception surface |
| 8 | **Cert identity is bound to `FSPIOP-Source`** | Without it a leaked accessKey plus *any* tenant's certificate is enough to transact as the victim |
| 9 | **Migration uses a parallel mTLS endpoint** | Per-tenant pace without a flag day and without app-layer enforcement |
| 10 | **AWS CloudHSM via PKCS#11 holds all FSPIOP signing keys and both CA roots** | Project requirements mandate operations *performed within* **dedicated** HSMs and name CloudHSM for the cloud phase. PKCS#11-direct avoids KMS per-request charges and keeps the deferred on-premise migration to a config change — `architecture.md` §4 |
| 11 | **`keyRef` is opaque and version-inclusive — rotation always mints a new one** | Key-version semantics differ irreconcilably across providers, and "sign with latest" silently breaks every peer |
| 12 | **The Hub does *not* map client cert → FSP identity; identity comes from `FSPIOP-Source`** | Verified against Mojaloop chart **v17.2.0** — no `auth-tls` / `ssl-client` / `verify-client` / `xfcc` anywhere in the tree, FSPIOP ingress templates are stock Bitnami-common with server-side TLS only. Confirms decisions 5 and 6. See [`hub-facing-leg.md`](./hub-facing-leg.md) §B2 |
| 13 | **Vault OSS PKI is the CA — roots in CloudHSM, intermediates in software** | The root ceremony is a standalone PKCS#11 script, so Vault never needs HSM integration. **No Enterprise licence, no step-ca, no new components** — `implementation-plan.md` §1.3 |
| 14 | **KMS custom key store is used for the Vault seal, not for signing** | Satisfies the mandated CloudHSM-plus-custom-key-store integration literally, while keeping payment-rate signing off a per-request meter |
| 15 | **Vault is not a key custodian and not on the signing path** | Compromising Vault yields the ability to *ask* the HSM to sign while access lasts, not a private key. This is what the in-HSM requirement buys |

**Consequence of 12:** Hub-facing mTLS is **additive**. The Hub performs no client-certificate
verification today, so enabling it is a coordinated, out-of-band change by the Hub operator with a
lead time — see §B3.

### Open

| # | Question | Blocks |
| --- | --- | --- |
| B | **What does a connector do on `revoke` for its tenant?** | Refuse and let JetStream redeliver, fail loudly, or drain then stop |
| C | **NATS authorization** — scope and approach | The request subjects are an injection path today, under every signing option |
| D | **Cache-miss behaviour** — fail open or closed | Proposal: fail *open* on cache-cold/unknown with an alarm, fail *closed* on known-and-revoked |
| E | **accessKey emergency revocation** | Certificates have a no-overlap emergency path; the accessKey does not |
| F | **Who may replace an accessKey** | `participant.access-key.update` is `HUB`-scoped today; self-service makes a portal login the root of trust |
| G | **Replay protection** | No nonce or timestamp is bound into the accessKey signature. `homeTransactionId` uniqueness is the zero-client-change alternative |
| H | **Which CA chain the DFSP downloads** | Pivotal's gateways currently use a publicly-trusted issuer, so possibly nothing needs installing |
| I | **Confirm the XFCC field** carries a usable fingerprint | Envoy exposes `Hash`, not a serial |
| J | **Remote-signing tenants fall back to delegated signing?** | Keeps external cloud credentials in one service rather than in every connector |
| K | **Self-service vs operator-mediated enrollment** | Determines whether portal and DFSP-scoped IAM are in this phase |
| L | **Confirm that HSM custody of the CA *roots* is sufficient** | Pivotal's position, not yet confirmed with the client. If the **intermediate** must also be in the HSM, the fallback is step-ca via PKCS#11 or Vault Enterprise Managed Keys. Everything else is unaffected |
| N | **Can a KMS custom key store hold `ECC_NIST_P256`?** | If not, PKCS#11-direct is the only working mechanism — not merely the cheaper one |
| O | **CloudHSM crypto-user provisioning and rotation** | CU credentials are static, not IAM-scoped. One CU per connector is what keeps per-tenant isolation true |

Full context, options and a recommendation for each are in
**[`open-decisions.md`](./open-decisions.md)**, grouped by what closing them unblocks:

| Tier | Items | Nature |
| --- | --- | --- |
| **1** — blocking, documents cannot be completed | **K** enrollment model | structural |
| **2** — security behaviour, specify before build | **D** cache-miss · **G** replay · **E** accessKey revocation · **B** connector on revoke · **C** NATS authz · **F** accessKey authority | policy |
| **3** — fact checks | **N** CKS asymmetric support · **H** DFSP CA chain · **I** gateway fingerprint field | lookup |
| **confirm with the client** | **L** intermediate-in-HSM scope · **O** crypto-user model | confirmation |
| deferred | **J** remote-signing fallback | optional |

**No open item can now invalidate an architectural choice.** A — the only one that could — resolved
in favour of the design (decision 12). The design is structurally committed.

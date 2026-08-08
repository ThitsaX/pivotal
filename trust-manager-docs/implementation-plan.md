# Implementation Plan

Schema, service changes, infrastructure, phasing and verification. Design rationale lives in
[`architecture.md`](./architecture.md) and the two leg documents.

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
| **Delegated signing** — generate a non-exportable EC P-256 key, sign a SHA-256 digest, return the public key | The `Signer` contract. Private keys must never be retrievable | **CloudHSM via PKCS#11** (§1.1). SoftHSM through the same interface for dev and CI |
| **Certificate authority** — issue leaf certs from a private CA, programmatically | Two CAs: DFSP-facing and Hub-facing client | **Vault OSS PKI** — roots in CloudHSM, intermediates in Vault (§1.3). No Enterprise licence |
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

The governing requirements are set out in [`architecture.md`](./architecture.md) §4.0. They settle
this row rather than leaving it open:

- **R1/R2** require operations *performed within* **dedicated** HSMs. That excludes software
  keystores, excludes protecting a software keystore with an HSM-held key, and excludes multi-tenant
  cloud KMS.
- **R3** names **AWS CloudHSM integrated with a KMS custom key store** for the cloud deployment
  period.

| | Product | Interface |
| --- | --- | --- |
| Cloud phase (now) | **AWS CloudHSM** — dedicated, FIPS 140-2 L3 | **PKCS#11** for signing; KMS custom key store for the Vault seal |
| On-premise (deferred, **R4**) | client data centre HSM | PKCS#11 |
| Dev / CI | **SoftHSM** | PKCS#11 |

**Use PKCS#11 direct for signing, not the KMS API.** Both reach the same cluster and both satisfy
**R1**, but the KMS path adds a **per-request charge on top of hardware already paid for**, and
stacks KMS API quotas on top of HSM capacity. Keeping the custom key store in genuine use for the
Vault seal satisfies **R3** literally while the metered path stays off the hot path.

**Capacity envelope for the infrastructure team**, derived in
[`hub-facing-leg.md`](./hub-facing-leg.md) §A1:

- **signatures per second** — roughly `TPS × 6`, so ~300/sec at 50 TPS and ~1,200/sec at 200 TPS
- **latency budget per signature**, noting ~6 occur serially per transaction
- **key count** — one per onboarded DFSP, plus two CA roots, plus headroom
- **HSM count is set by HA, not throughput.** A two-HSM cluster is the practical floor regardless of
  volume, so dropping from 200 to 50 TPS saves at most one instance
- **cluster count is the real cost driver** — one shared regional deployment versus one per country
- **per-operation audit logging**

### 1.2 Reaching CloudHSM without a long-lived secret

Every workload that signs must authenticate to the HSM. **CloudHSM authenticates crypto users with a
username and password, not with IAM policy** — which changes the shape of this from the cloud-KMS
case:

| Concern | Approach |
| --- | --- |
| Workload identity | Kubernetes ServiceAccount → Vault k8s auth, as today |
| Delivering CU credentials | Vault KV, alongside the `keyRef` |
| Per-tenant isolation | **One crypto user per connector**, owning or shared only that tenant's key |
| Rotation | CU credentials are static — rotation is an operational procedure, not an expiry |

**Never use one shared crypto user across all connectors.** That collapses the isolation described in
[`architecture.md`](./architecture.md) §3: any connector could then sign as any DFSP. CU provisioning
and rotation is open decision **O**, because retrofitting per-tenant crypto users across every
connector later is painful.

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

**Build root CRL signing into the same script.** Revoking an intermediate requires a root-signed CRL —
a second bespoke PKCS#11 operation. Far cheaper to write while the ceremony tooling is open than to
discover during an incident.

After bring-up, **day-to-day certificate issuance never touches CloudHSM.** Vault PKI does all of it,
driven by cert-manager.

---

## 2. Schema

### New — `participant_key` (public registry, versioned)

`id`, `fsp_id`, `key_type` (`jws` / `access`), **`role` (`self` / `peer`)**, `kid`, `algorithm`,
`public_key_pem`, `status` (`active` / `retiring` / `revoked`), `valid_from`, `valid_to`, `source`
(`self` / `mcm-pull`), `created_at`, `updated_at`.

The `role` column is a **prerequisite**, not a normalization — today `participant` cannot hold a
peer, because `add-signing-keys` marks `jwsPrivateKey` `@IsNotEmpty()`.

### New — `participant_cert` (DFSP-facing client certs)

`id`, `fsp_id` (**the binding target**), `serial`, **`fingerprint_sha256`** (the runtime lookup key
from XFCC), `subject` (CN **enforced** to `fsp_id` at issuance), `cert_pem`, `ca_chain_ref`,
`status` (`active` / `retiring` / `revoked` / `expired`), `valid_from`, `valid_to`, `issued_at`,
`revoked_at`.

### New — `participant_key_ref` (pointer, never key material)

`fsp_id`, `key_use` (`jws-sign` / `ca` / `mtls-server`), `provider` (`pkcs11` / `aws-kms` / …),
`key_ref`, `created_at`.

This table is the **source of truth** for references. trust-manager additionally **projects** the
`jws-sign` row into Vault KV at `secret/pivotal/keyref/<fspId>`, because the Java connectors have no
MySQL access and read their reference from Vault using the credential they already hold for signing.
Same value, two readers — MySQL for the TypeScript data plane, KV for the connectors. Write MySQL
first, then KV, then publish the nudge.

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

Stop writing `jws_private_key`. Existing values are **not migrated** — fresh EC keys are generated in
CloudHSM and re-published — then drop the column.
**Seed a `hub` participant** — none exists, and without it every Hub-originated error fails with
3105 once JWS is enabled.

Because the algorithm is **ES256**, migration must **generate fresh** keys and re-publish — existing
RSA private keys are not carried into Transit. Transit key type is fixed at creation, so an RSA key
cannot later become EC; this is decided once, before any key exists.

### RBAC

New DFSP-scoped permissions for certificate enrollment. Auth migrations currently stop at `V9`.

---

## 3. Changes to existing services

| Area | Change |
| --- | --- |
| `shared/security` | `KeyProvider` / `Signer` interface; provider implementations; **`AccessKeyStore.get()` must return an ordered list**, not a single key |
| `shared/security/component/jwt/jwt.ts` | `algorithms: ['RS256']` is hardcoded in `verify`, and `sign` defaults to `RS256` — blocks ES256 everywhere |
| `shared/fspiop` signing interceptor | rebuild the protected header to the five normative fields with exact casing; set `fspiop-uri` and `fspiop-http-method` HTTP headers; sign via `Signer` |
| `shared/fspiop` inbound guard | verify against `participant_key` (self **and** peer roles) |
| `web-outbound` `access.guard.ts` | try-both key verification; XFCC fingerprint lookup; **binding check** against `FSPIOP-Source` |
| `core/participant` stores | source from `participant_key`; **per-fspId reload**; JetStream subscriber |
| `core/participant` handlers | register (not issue) accessKeys; publish to MCM; stop writing private keys |
| **Java connectors** (one per tenant) | build the protected header, sign via **PKCS#11** to CloudHSM, manage the HSM session, send the two new HTTP headers, subscribe to `trust.keys.<fspId>`, **ack after the Hub PUT** |
| **web-inbound Gateway** | `mode: MUTUAL` for the Hub; serve the Hub-CA-signed server cert; trust the Hub CA for inbound client certs |
| `web-pivotal` + portal | CSR upload, cert + chain download, cert status, accessKey registration, contact management |
| **new** | `apps/trust-manager`, `core/trust/domain`, **`shared/pkcs11`** (the `Signer`), `shared/vault` (KV + auth), `shared/mcm-client`, `shared/trust-events`, shared Java signing artifact, **root-ceremony script** |

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

0. **HSM and CA bring-up.** Provision the CloudHSM cluster and the KMS custom key store, move Vault
   to auto-unseal against it, create the per-tenant crypto users, and run the **root ceremony** twice
   (§1.3) so both trust domains have a CloudHSM root and a Vault PKI intermediate. *Prerequisite for
   phases 1, 5 and 6 — nothing else can start without it.*
1. **Custody + JWS correctness.** The PKCS#11 `Signer`, per-DFSP keys generated in CloudHSM,
   `participant_key` with self/peer roles, seed the `hub` participant, fix the protected header and
   the hardcoded `RS256`, write the conformance vectors. *Nothing external changes yet — signatures
   simply become correct.*
2. **Propagation.** `TRUST_KEYS` at R=3, `shared/trust-events`, `TrustCacheSubscriber`, the §4 fixes,
   consumer-lag alerts. *Sub-second invalidation, self-bootstrapping cold start.*
3. **Connector signing.** Shared Java artifact, Vault auth per connector, keyRef and HSM credentials
   from Vault KV, PKCS#11 session handling, the
   invalidation consumer, ack-after-PUT. *Payee-side callbacks become signed.*
4. **MCM registry sync.** Keycloak, then MCM, then `shared/mcm-client`; publish own keys and pull
   peers. *Interop with external participants.*
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

**Phase 0** — a key generated in CloudHSM reports as non-exportable and cannot be extracted by any
API. Each trust domain chains correctly: leaf → Vault intermediate → CloudHSM root. Vault unseals
automatically after a full restart with no operator input. A connector's crypto user can sign with its
own tenant's key and is **refused** on another tenant's. Rehearse the root CRL path once, before you
need it.

**Phase 1** — conformance vectors pass in both Java and TypeScript. A signed request validates
against a real `JwsValidator` instance with the registered public key. Signing works with the private
key absent from MySQL.

**Phase 2** — kill a data-plane pod mid-rotation and confirm it converges from the stream on restart
with no warm-up query. Stop JetStream and confirm the reconcile poll still converges. Verify the
stream reports `replicas=3` and `MaxMsgsPerSubject=1`.

**Phase 3** — a connector signs and the Hub accepts. Force a Hub 500 and confirm JetStream redelivers
rather than the transfer hanging. Revoke a connector's Vault policy and confirm it fails closed.

**Phase 5** — `GET /dfsps/{dfspId}/ca` returns the same CA for every tenant, matching
`mcm_ca_registration`. `openssl s_client` with the leaf completes against the Hub ingress. Two
tenants transact over one pooled connection with a single client certificate. Force a cert-manager
renewal and confirm traffic continues **with no MCM interaction** — this is what proves CA-level
registration works.

**Phase 6** — a DFSP presenting a certificate whose `fsp_id` does not match its `FSPIOP-Source` is
rejected. A cold pod with JetStream down behaves per the agreed cache-miss rule. Rotation with
overlap succeeds without the DFSP changing its client.

**Throughput** — benchmark PKCS#11 `C_Sign` against the cluster at the chosen algorithm before
committing. Size for 3–5× steady state, not average. Instrument the sign call separately from
end-to-end latency.

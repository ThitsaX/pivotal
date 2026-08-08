# Trust-Manager — Flow Diagrams

Single home for all trust-manager operational flows on the chosen **JetStream** propagation design.
Companion to [`trust-manager-architecture.md`](./trust-manager-architecture.md) (conceptual
architecture) and [`trust-manager-implementation-plan-jetstream.md`](./trust-manager-implementation-plan-jetstream.md)
(the build plan).

**Nine diagrams**, three tiers: overview → control-plane lifecycle → data-plane runtime.

## Legend / invariants (true in every diagram below)

- **MySQL is the single source of truth.** JetStream carries **invalidation nudges only — never key material**.
- **The data plane never calls trust-manager.** It reads MySQL, is *nudged* by JetStream, and is backstopped by a **5–15 min reconcile poll**.
- **Private keys stay in Vault** (delegated `Signer`). The data plane holds only a `keyRef + kid`; signing is delegated.
- **mTLS is validated at the TLS handshake (per-connection)** by Envoy — not per request. Envoy **injects** the `X-Forwarded-Client-Cert` (XFCC) header and strips any client-supplied one. **Hard requirement:** Envoy must be configured `SANITIZE_SET`, never `APPEND_FORWARD` — XFCC carries *identity*, so a client-settable XFCC would defeat the binding rule below.
- **Certificate identity is bound to `FSPIOP-Source`.** The client cert and the accessKey JWT are **two independent credentials**, and a request is rejected unless both name the **same** DFSP. Without this the cert only proves "some enrolled tenant", and a leaked accessKey alone would be enough to move that tenant's money. Active in `mtls` mode only.
- **Rotation / renewal is additive with an overlap window** — the old key/cert goes `active → retiring` (not deleted), so there is **zero downtime**.
- **Publish happens *after* the DB commit** — never before.

Two toggles gate whole flows: `DFSP_TRANSPORT_MODE = vpn | mtls` (DFSP-facing mTLS/CA active only in `mtls`) and `HUB_MTLS_MODE = mesh | mcm-enroll` (Hub-facing cert enrollment active only in `mcm-enroll`).

---

# Tier 1 — Overview

## 1. High-level — System context / propagation path

MySQL = source of truth · JetStream = durable transport · poll = audit. Control-plane writes are
solid; data-plane reads (the two propagation channels) are dotted; live transaction traffic is thick.

```mermaid
flowchart LR
    DFSP["dfsp-backend<br/>(core banking / wallet)"]

    subgraph TM["trust-manager (control plane)"]
      direction TB
      ORCH["Orchestrator + Scheduler"]
      EV["events publisher"]
      KP["KeyProvider / Signer"]
      ORCH --> KP
      ORCH --> EV
    end

    VAULT[("Vault<br/>private keys")]
    DB[("MySQL — SOURCE OF TRUTH<br/>participant_key · participant_cert")]

    subgraph JS["NATS JetStream"]
      STREAM["stream TRUST_KEYS<br/>subject trust.keys.&lt;fspId&gt;<br/>MaxMsgsPerSubject=1 · replicas=3"]
    end

    subgraph DP["Pivotal data plane"]
      direction TB
      OUT["web-outbound<br/>TrustCacheSubscriber"]
      IN["web-inbound<br/>TrustCacheSubscriber"]
    end

    subgraph HUB["Mojaloop Hub"]
      MCM["connection-manager-api<br/>(JWS registry + CA)"]
      SVC["FSPIOP services"]
    end

    KP --> VAULT
    KP -->|"write public keys"| DB
    ORCH -->|"commit change"| DB
    EV -->|"publish invalidate (no key material)"| STREAM

    STREAM -.->|"durable · DeliverLastPerSubject<br/>(fast + cold-start)"| OUT
    STREAM -.->|"durable · DeliverLastPerSubject"| IN
    DB -.->|"reconcile poll 5–15min<br/>(source-of-truth audit)"| OUT
    DB -.->|"reconcile poll 5–15min"| IN

    DFSP -->|"CSR → cert + CA chain"| TM
    DFSP <==>|"mTLS + secured-sendmoney JWT (live)"| OUT
    TM <-->|"publish / pull JWS · CA"| MCM
    OUT <==>|"FSPIOP (JWS / mTLS)"| SVC
    IN <==>|"FSPIOP callbacks"| SVC

    classDef ctrl fill:#eef4ff,stroke:#4466aa;
    classDef ext fill:#eefaef,stroke:#3a8a4a;
    classDef sot fill:#fff3d6,stroke:#c90;
    class TM,KP ctrl;
    class DFSP,MCM,SVC,VAULT ext;
    class DB,STREAM sot;
```

**How to read it:** trust-manager commits to MySQL then publishes a nudge; the data plane consumes
via two dotted channels (durable stream = fast, poll = audit) and never calls trust-manager back.
Private keys stay in Vault; live traffic (thick) runs on already-cached material, so trust-manager
can be down and transactions keep flowing.

## 2. Propagation sequence — rotate / revoke

The generic control→data mechanic behind every lifecycle flow in Tier 2.

```mermaid
sequenceDiagram
    autonumber
    participant TM as trust-manager
    participant DB as MySQL (SoT)
    participant JS as JetStream
    participant DP as data-plane store

    Note over TM,DB: 1. Commit the change
    TM->>DB: write participant_key / cert (new version)
    Note over TM,JS: 2. Publish AFTER commit (Nats-Msg-Id dedup)
    TM->>JS: publish trust.keys.<fspId> {reason, version}
    Note over JS,DP: 3a. Fast path (durable)
    JS-->>DP: deliver invalidate
    DP->>DB: reload fspId material (idempotent)
    DP->>DP: swap in-memory cache (sub-second)
    DP-->>JS: ack
    Note over DP: cold start → DeliverLastPerSubject replays latest per fspId
    Note over DB,DP: 3b. Backstop (rare)
    loop every 5–15 min
        DP->>DB: reconcile by updated_at / version
    end
    Note right of DP: catches publisher-crash-before-publish<br/>and stream drift — the gaps JetStream can't cover
```

**How to read it:** commit → publish → deliver → reload → ack, all sub-second and idempotent.
Cold-start is free (`DeliverLastPerSubject`). The 5–15 min loop is the only thing covering the gap
JetStream can't: a change committed to MySQL whose nudge was never published, or stream drift.

---

# Tier 2 — Control-plane lifecycle

## 3. Onboarding (Day-1)

Provisioning a brand-new DFSP: register the participant, mint its Hub-facing **self JWS** key and
publish it to the Hub registry, and record the DFSP-supplied **accessKey** public key — then let the
data plane pick everything up.

> **Two different key models sit side by side in this flow.** The **self JWS** key is *generated by
> Pivotal* (private half never leaves Vault, public half is published to MCM). The **accessKey** is
> *generated by the DFSP* — Pivotal never sees its private half and only records the public key it
> was handed. Diagram 5 is the same registration path used later for rotation.

```mermaid
sequenceDiagram
    autonumber
    actor U as DFSP / operator
    participant P as portal + web-pivotal
    participant TM as trust-manager<br/>(Hub-facing + DFSP-facing + events)
    participant CL as central-ledger
    participant V as Vault (Signer)
    participant DB as MySQL (SoT)
    participant MCM as Hub connection-manager-api
    participant JS as JetStream
    participant DP as web-outbound / web-inbound

    Note over U,P: DFSP generates its OWN accessKey keypair — private half never leaves the DFSP
    U->>P: onboard DFSP (name, currencies, endpoint, accessKey PUBLIC key)
    P->>TM: onboard tenant (fspId, accessKey public key)

    Note over TM,CL: register participant (reuse onboard-fsp.handler → CentralLedgerFacade.onboardFsp)
    TM->>CL: onboard participant + endpoints

    Note over TM,MCM: Hub-facing — self JWS identity
    TM->>V: generateKey → self JWS keyRef (private stays in Vault)
    TM->>DB: write participant_key (jws, role=self, active)
    TM->>MCM: publish self JWS PUBLIC key (registry)

    Note over TM,DB: DFSP-facing — accessKey (register only, no keygen — Pivotal holds the PUBLIC key)
    TM->>DB: write participant_key (access, active)

    TM->>TM: commit
    TM->>JS: publish trust.keys.<fspId> {jws + access}
    TM-->>P: onboarded
    P-->>U: done

    JS-->>DP: deliver invalidate
    DP->>DB: load self keyRef/kid (web-outbound) · peer set (web-inbound)
    DP->>DP: populate caches
```

**How to read it:** onboarding fans out to three systems — central-ledger (participant),
MCM (publish the self JWS public key so peers can verify us), and MySQL (local registry rows).
Only the **public** key goes to MCM; the JWS private key never leaves Vault. The accessKey touches
Vault at no point — there is no private half on Pivotal's side to protect. The single
commit-then-nudge lets the data plane converge without any direct call.

## 4. DFSP-facing mTLS enrollment (CSR → cert + CA chain)

Active only when `DFSP_TRANSPORT_MODE = mtls` (no VPN). Pivotal is the CA; the DFSP's private key
**never leaves the DFSP**.

```mermaid
sequenceDiagram
    autonumber
    actor U as DFSP admin
    participant D as dfsp-backend
    participant P as portal + web-pivotal (IAM + RBAC)
    participant TM as trust-manager<br/>DFSP-facing CA + events
    participant V as Vault PKI (CA)
    participant DB as MySQL (SoT)
    participant JS as JetStream
    participant O as web-outbound

    D->>D: generate keypair + CSR (private key stays here)
    U->>P: log in, upload CSR
    P->>P: authz + RBAC (certs.enroll, DFSP-scoped)
    P->>TM: sign CSR (fspId)
    TM->>TM: enforce subject CN equals fspId (ignore any CSR-supplied CN)
    TM->>V: sign via Vault PKI
    V-->>TM: signed cert (NotBefore=now, NotAfter=now+validity)
    TM->>DB: write participant_cert (active, fsp_id, fingerprint)
    TM->>TM: commit
    TM->>JS: publish trust.keys.<fspId> {cert}
    TM-->>P: cert ready
    P-->>U: download signed cert + CA chain
    U->>D: install cert + CA chain
    JS-->>O: deliver invalidate → O loads cert status (active)
    Note over D,O: mTLS live — Envoy validates chain vs CA at handshake
```

**How to read it:** CSR-based enrollment means Pivotal signs a public cert but never sees the DFSP's
private key. The CA chain is public — the real concern is authenticity of first delivery, so it's
downloaded over the authenticated HTTPS portal. web-outbound only needs the cert **status** (active),
which arrives via the same nudge.

## 5. Control-plane update — DFSP accessKey change propagation (portal → web-outbound)

The DFSP rotates its accessKey (DFSP-facing). Only web-outbound reacts.

```mermaid
sequenceDiagram
    autonumber
    actor U as DFSP admin
    participant P as portal + web-pivotal<br/>(IAM + RBAC)
    participant TM as trust-manager<br/>DFSP-facing module + events
    participant DB as MySQL<br/>participant_key (SoT)
    participant JS as JetStream<br/>TRUST_KEYS
    participant O as web-outbound<br/>TrustCacheSubscriber · AccessKeyStore

    U->>P: log in, submit new accessKey (public key)
    P->>P: authz + RBAC (accessKey-update, DFSP-scoped)
    P->>TM: update/rotate accessKey (fspId)
    TM->>DB: write participant_key (access, new version)<br/>old row → retiring (overlap)
    TM->>TM: commit
    TM->>JS: publish trust.keys.<fspId> {keyType:"access", reason:"rotate"}
    TM-->>P: 200 OK
    P-->>U: "accessKey updated"
    JS-->>O: deliver invalidate (keyType=access)
    O->>DB: reload fspId access material
    O->>O: swap AccessKeyStore cache · ack
    Note over O: next /secured/sendmoney verified with NEW accessKey<br/>(old still accepted during overlap → zero downtime)
```

**How to read it:** accessKey is DFSP-facing, so **only web-outbound** consumes the nudge (web-inbound
filters it out by `keyType`). The old key goes `retiring`, not deleted, so in-flight requests still
verify. The 5–15 min reconcile poll would catch this even if the nudge were dropped.

## 6. Peer JWS pull / refresh (MCM → web-inbound)

The Hub-facing mirror of #5: a **peer** DFSP rotated its key and published to MCM; Pivotal pulls it
so web-inbound can verify that peer's callbacks.

```mermaid
sequenceDiagram
    autonumber
    participant MCM as Hub connection-manager-api<br/>(JWS registry)
    participant TM as trust-manager<br/>scheduler (peer-refresh) + events
    participant DB as MySQL<br/>participant_key (SoT)
    participant JS as JetStream<br/>TRUST_KEYS
    participant I as web-inbound<br/>TrustCacheSubscriber · PublicKeyStore

    loop peer-refresh loop
        TM->>MCM: GET peer jwscerts
        MCM-->>TM: peer public keys (+ kid)
        TM->>DB: upsert participant_key (jws, role=peer, source=mcm-pull)
        TM->>TM: commit
        TM->>JS: publish trust.keys.<peerFspId> {keyType:"jws"}
    end
    JS-->>I: deliver invalidate (keyType=jws)
    I->>DB: reload peer keys
    I->>I: swap PublicKeyStore cache · ack
    Note over I: inbound Hub callback from that peer now verifies (else error 3105)
```

**How to read it:** peers rotate their **own** keys — Pivotal never rotates a peer key, it just
**pulls** the new public key from MCM (the shared registry that makes cross-connector interop work)
and refreshes web-inbound. This is why a peer's rotation doesn't break inbound verification.

---

# Tier 3 — Data-plane runtime + lifecycle tail

## 7. Runtime transaction path — `/sendmoney` outbound send

Both legs on one live call. Every key lookup is an **in-memory cache hit**; the only per-request
crypto is the Vault sign in Phase 2.

```mermaid
sequenceDiagram
    autonumber
    participant D as dfsp-backend
    participant E as Envoy / Istio ingress<br/>(mTLS termination)
    participant O as web-outbound<br/>AccessGuard · SigningInterceptor
    participant OC as web-outbound cache<br/>(AccessKeyStore · cert status · signing keyRef)
    participant V as Vault Transit<br/>(Signer)
    participant H as Mojaloop Hub<br/>(FSPIOP services)
    participant I as web-inbound<br/>fsp-inbound.guard
    participant IC as web-inbound cache<br/>(peer JWS PublicKeyStore)

    Note over OC,IC: caches populated OUT-OF-BAND by JetStream nudge + 5–15min reconcile poll

    rect rgb(238,244,255)
    Note over D,E: PHASE 0 — mTLS handshake (per CONNECTION, only if DFSP_TRANSPORT_MODE=mtls)
    D->>E: TLS ClientHello + client cert
    E->>E: validate cert chain vs Pivotal CA (handshake)
    Note right of E: reused on pooled keep-alive conns → not per request — VPN mode skipped
    end

    rect rgb(238,250,239)
    Note over D,H: PHASE 1 — DFSP-facing leg: POST /secured/sendmoney
    D->>E: POST /secured/sendmoney (accessKey JWS body)
    E->>O: forward + inject XFCC (SANITIZE_SET — any client-supplied XFCC stripped)
    O->>OC: look up cert by XFCC fingerprint
    OC-->>O: participant_cert row {fsp_id, status} (in-memory, no DB call)
    O->>O: revocation check — status must be active or retiring, else reject
    O->>O: BIND — row.fsp_id must equal FSPIOP-Source, else reject
    O->>OC: accessKey for FSPIOP-Source
    OC-->>O: accessKey (in-memory)
    O->>O: verify secured-sendmoney JWS + body integrity
    end

    rect rgb(255,243,214)
    Note over O,H: PHASE 2 — Hub-facing leg: sign FSPIOP + dispatch
    O->>OC: self JWS keyRef + kid
    OC-->>O: keyRef + kid
    O->>V: sign(keyRef, FSPIOP digest)
    V-->>O: signature (private key never leaves Vault)
    O->>H: FSPIOP POST /quotes,/transfers · FSPIOP-Signature [+ mesh/enrolled mTLS]
    H-->>O: 202 Accepted
    end

    rect rgb(238,250,239)
    Note over H,I: PHASE 3 — Hub callback → web-inbound (peer verify)
    H->>I: PUT /quotes/{id},/transfers/{id} · FSPIOP-Signature (peer JWS)
    I->>IC: peer public key for FSPIOP-Source (kid)
    IC-->>I: peer JWS public key (in-memory)
    I->>I: verify peer signature (else 3105)
    I-->>H: 200 OK
    end

    O-->>D: PUT /secured/sendmoney callback (final result)
```

**Why three checks in Phase 1, and why in that order.** Envoy has already proved the caller holds a
key for a cert *our CA issued* — but not **which tenant** they are. The three app-layer checks close
that gap, cheapest rejection first: revocation status, then the **binding** of cert identity to
`FSPIOP-Source`, then the (most expensive) signature verification. The binding check is effectively
free: the same cached row fetched for the revocation check already carries `fsp_id`. Without it the
two credentials are independent, and a leaked accessKey plus *any* enrolled tenant's cert would be
enough to transact as the victim. In `vpn` mode there is no cert, so only the signature check runs
and the accessKey is the sole credential — a deliberately weaker posture (see open decisions).

**How to read it:** mTLS is validated once at the handshake (Phase 0), so most `/sendmoney` calls
ride an already-validated pooled connection. Auth and verify (Phases 1 & 3) are pure in-memory
lookups. The single per-message network crypto is the delegated Vault sign (Phase 2) — the real TPS
lever (~300 signs/sec at 100 TPS).

## 8. Inbound receive path (Hub → web-inbound → connector → Payee FSP)

The receive direction: a peer-initiated transfer arrives *for* one of Pivotal's DFSPs. Note that
web-inbound never calls a DFSP backend directly — it publishes to NATS, and the **per-tenant
connector** makes that call and issues the FSPIOP callback to the Hub itself.

```mermaid
sequenceDiagram
    autonumber
    participant H as Mojaloop Hub<br/>(FSPIOP services)
    participant I as web-inbound<br/>fsp-inbound.guard · PublicKeyStore
    participant IC as web-inbound cache<br/>(peer JWS keys)
    participant N as NATS JetStream
    participant C as per-FSP connector<br/>(one deployment per tenant)
    participant D as Payee FSP backend<br/>(core banking)

    Note over H,I: peer DFSP sent a transfer to OUR DFSP — Hub forwards
    H->>I: POST /quotes,/transfers · FSPIOP-Signature (peer JWS)
    I->>IC: peer public key for FSPIOP-Source (kid)
    IC-->>I: peer JWS public key (in-memory)
    I->>I: verify peer signature (else 3105)
    I->>N: publish fspiop.{payeeFsp}.post.quotes / .post.transfers
    N->>C: deliver to that tenant's connector

    rect rgb(240,240,240)
    Note over C,D: OUTSIDE TRUST-MANAGER SCOPE — manually managed, the FSP is the CA
    C->>D: call DFSP backend (VPN tunnel, or one-way TLS to a public FQDN)
    D-->>C: quote / accept response
    end

    C->>C: sign FSPIOP callback with that tenant's self JWS key
    C->>H: PUT /quotes/{id},/transfers/{id} · FSPIOP-Signature
    H-->>C: 200 OK
```

**How to read it:** the mirror of #7 — verification uses the same cached **peer** JWS keys. But the
DFSP-facing hop belongs to the **connector**, not web-inbound, and the connector also signs and
sends the Hub callback itself. That has a consequence for the Hub-facing JWS work: signing is **not**
confined to the Pivotal monorepo — every connector needs access to its tenant's signing key and must
produce a correctly-formed FSPIOP protected header.

> **Scope boundary — `connector → Payee FSP` is outside trust-manager.**
> On this hop Pivotal is the **client** and the FSP is both the **server and the CA**, so lifecycle
> authority sits with the FSP. Provisioning is handled manually between DevOps and the FSP's team.
> Pivotal holds **no key material** here — the connectors carry no keystore, truststore or client
> certificate — so there is nothing for trust-manager to custody, and no reason to build a
> cross-language distribution path to reach the Java connectors.
>
> Two follow-ups that do **not** reopen the scope decision:
> - Because the process is manual, nothing alerts on an FSP server certificate nearing expiry — that
>   connector simply stops. A TLS endpoint probe per `BACKEND_ENDPOINT` (e.g. blackbox_exporter's
>   `probe_ssl_earliest_cert_expiry`) reuses the monitoring stack §4.1 already requires.
> - Several backends are bare private IPs, which cannot chain to a public CA. Confirm with the
>   connector team whether server-certificate verification is enabled there (custom truststore) or
>   disabled. If disabled, that hop has encryption but no server authentication — acceptable inside a
>   VPN, but it should be a stated posture rather than an accident.

## 9. Cert lifecycle — renewal · expiry-alert · revocation

The DFSP-facing cert over time (`DFSP_TRANSPORT_MODE = mtls`). State model first, then the operational flow.

```mermaid
stateDiagram-v2
    [*] --> active: CSR signed (day-1 or renewal)
    active --> retiring: newer cert issued (overlap begins)
    retiring --> expired: NotAfter passes (natural — normal path)
    active --> revoked: emergency (compromise / offboard / mis-issue)
    retiring --> revoked: optional cleanup after overlap
    revoked --> [*]
    expired --> [*]
```

```mermaid
sequenceDiagram
    autonumber
    participant SCH as trust-manager scheduler
    participant DB as MySQL (SoT)
    participant PR as Prometheus / Alertmanager
    participant L2 as 24/7 L2 support
    actor U as DFSP admin
    participant TM as trust-manager CA + events
    participant JS as JetStream
    participant O as web-outbound

    rect rgb(238,250,239)
    Note over SCH,L2: NORMAL — renewal before expiry
    SCH->>DB: read participant_cert.valid_to
    SCH->>PR: expose not_after gauge
    PR->>L2: alert ladder (30d warn → 7d crit)
    L2->>U: runbook: please renew (or DFSP auto-renews via API)
    U->>TM: submit NEW CSR
    TM->>DB: new participant_cert (active) · old → retiring (overlap)
    TM->>JS: publish {cert}
    JS-->>O: reload → both serials accepted during overlap
    U->>U: install new cert, graceful mTLS reload
    Note over O: overlap ends → old cert expires naturally (retiring → expired)
    end

    rect rgb(255,236,236)
    Note over TM,O: EMERGENCY — revocation (compromise / offboard / mis-issue)
    U->>TM: report compromise (or operator offboards)
    TM->>DB: participant_cert.status = revoked (no overlap)
    TM->>JS: publish {cert, reason:revoke}
    JS-->>O: reload → reject serial sub-second (even on open keep-alive conns)
    Note over U,O: DFSP must re-enroll (new CSR) to resume
    end
```

**How to read it:** normal renewal **never revokes** — the old cert is left to expire after an
overlap, giving zero downtime. Revocation is a separate emergency path with no overlap; because
enforcement is app-layer (XFCC serial → cached status), it takes effect within seconds even on
already-open connections, which a handshake-only CRL/OCSP would miss.

---

## Coverage map

| Tier | Diagram | Leg(s) | Plane |
| --- | --- | --- | --- |
| 1 | System context / propagation path | both | both |
| 1 | Propagation sequence (rotate/revoke) | both | control→data |
| 2 | Onboarding (Day-1) | both | control |
| 2 | DFSP-facing mTLS enrollment | DFSP-facing | control |
| 2 | accessKey update propagation | DFSP-facing | control→data |
| 2 | Peer JWS pull / refresh | Hub-facing | control→data |
| 3 | Runtime `/sendmoney` outbound send | both | data |
| 3 | Inbound receive path (via connector) | both — payee hop out of scope | data |
| 3 | Cert lifecycle (renewal/alert/revocation) | DFSP-facing | control→data |

**Not covered by design, deliberately:** `connector → Payee FSP`. Manually provisioned between
DevOps and the FSP, the FSP is the CA, and Pivotal holds no key material there. See the scope
boundary under diagram 8.

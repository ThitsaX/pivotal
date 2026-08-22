# TODO Before Bulk Transfer Implementation

**Status:** open — pre-implementation review
**Date:** 2026-08-19
**Scope:** proposed `POST /secured/bulk-sendmoney` on `web-outbound`, plus the queued execution and
status/result endpoints behind it.

---

## The feature, as proposed

A DFSP submits N send-money requests in one signed call. Pivotal responds `202 ACCEPTED` with a bulk
request id, then drives each item through the ordinary three-phase flow — `GET /parties`,
`POST /quotes`, `POST /transfers` — with `acceptParty` and `acceptQuote` forced to `true`. The caller
polls for status and, on completion, retrieves a list of ordinary `SendMoneyResponse` objects.

**Verdict: doable, with high reuse.** The three phase handlers are already `CommandBus` commands with
no HTTP coupling, so a driver can call `PostSendMoneyCommand` → `PutAcceptPartyCommand` →
`PutAcceptQuoteCommand` in sequence. No new FSPIOP or ILP code is required.
`report_download_requests` + `report-worker` is an in-repo precedent for the submit → queue → poll →
fetch pattern.

This document records what must be settled **before** that work starts.

---

## 1. Blockers — fix before writing bulk code

### B1. The parties waiter collides on same-payee items

`FspiopResponseSubscriber` keys in-flight waiters by NATS subject in a
`Map<string, PendingEntry>` (`packages/shared/fspiop/component/nats/fspiop-response-subscriber.ts:57`).
Parties subjects are addressed by FSPIOP **resource path**, not by transaction id:

```
pivotal.fspiop.response.parties:{payer}:{payee}:{partyIdType}:{partyId}[:{subId}]
```

Two concurrent lookups for the same payee in the same process therefore register on the same key, and
the second `pending.set` (`:161`) **overwrites** the first. Worse, when the orphaned waiter's 30s
timer fires it calls `cancel(successSubject)`, which resolves the entry *by subject* (`:184`) and
deletes the **second** waiter's registrations. The failure cascades.

Bulk is precisely the workload that makes concurrent same-payee lookups routine — salary runs, repeat
disbursements, re-submitted rows.

**Contained by two facts:**

- Only parties subjects can collide. `quoteRequest.quoteId = transferId`
  (`packages/core/outbound/domain/command/put-accept-party.handler.ts:256`) and `transferId` is a
  per-transaction ULID, so `quotes:` and `transfers:` subjects are globally unique.
- There are exactly three call sites, all in `packages/core/outbound/domain/command/`:

  | File | `waitFor` | `cancel` |
  | --- | --- | --- |
  | `post-send-money.handler.ts` | :218 | :231 |
  | `put-accept-party.handler.ts` | :143 | :155 |
  | `put-accept-quote.handler.ts` | :202 | :214 |

**Fix.** Change `pending` to `Map<string, Set<PendingEntry>>`; `dispatch` takes the oldest waiter
(FIFO — `Set` preserves insertion order) and removes **by entry**, not by subject. Change `waitFor` to
return a handle (`{ promise, cancel }`) so each caller cancels only its own waiter, which removes the
by-subject ambiguity entirely. Single-waiter behaviour is unchanged, so this is safe to ship on its
own ahead of the bulk work.

**Replica safety.** Cross-replica correctness already comes from `LimitsPolicy` fan-out on
`PIVOTAL_FSPIOP_RESPONSE` — every `web-outbound` replica runs its own ephemeral consumer and receives
every message, so two waiters on different replicas both resolve today. The fix only makes the
in-process structure consistent with what the distributed design already assumes. It adds no
distributed state and requires no coordination between replicas. Connectors are untouched: their
durables are derived from the tenant (`connector-post-transfers.listener.ts:69`), so replicas of one
connector form a queue group and each message is handled exactly once.

**No tests exist for this class** — `tests/shared/nats/` contains only `stream-provisioner-test.ts`.
Add at minimum: two waiters on one subject both resolve; one timing out does not cancel its sibling;
`cancel()` affects only its own waiter; single-waiter regression guard.

**Freebie in the same change.** `onModuleDestroy` (`:107`) cancels pending entries — clearing their
timers — but never settles the promises. On SIGTERM, in-flight requests hang with their timeout
already cancelled instead of failing fast. Reject pending waiters with an explicit FSPIOP error on
shutdown; this fits the existing graceful-shutdown work.

> **Production note.** `webOutbound.replicaCount: 5` in
> `prod-hub-guinea-gitops/apps/pivotal/values.yaml`. This defect is live today, bounded only by how
> often two concurrent lookups for the same payee land on the same replica within the 30s window. If
> sporadic unreproducible `SERVER_TIMED_OUT` on party lookups has been observed, this is a candidate
> explanation — worth a log check before scheduling.

### B2. `AccessGuard` silently stops covering the body if the payload is a top-level array

```ts
// packages/apps/web-outbound/component/access.guard.ts:110
private static isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value != null && !Array.isArray(value);
}
```

`resolvePayload` (`:115`) falls back to `{ date }` when the body is not a JSON **object** — and an
array is not. A bulk request sent as a bare `[ {...}, {...} ]` would authenticate against a signature
covering only the `Date` header, leaving the entire batch swappable in transit with no error raised.

**Fix.** The bulk envelope must be an object: `{ bulkRequestId, transfers: [...] }`. Cheap to get
right, silent and severe to get wrong. Consider also rejecting array bodies explicitly rather than
letting them fall through.

**Related:** `toCanonicalJson` (`:145`) recursively re-serialises the whole body inside the guard on
every request. A multi-megabyte batch is a synchronous CPU stall on the event loop. Cap the item
count, and treat that cap as a correctness parameter rather than a tuning knob.

### B3. A retried bulk submit pays the batch twice

`POST /sendmoney` is deliberately unlocked — it is not money-moving, so the MOJ-1128 in-flight lock
was applied only to the two `PUT` handlers. A bulk submit **is** money-moving: it commits N transfers.
The same gateway per-try-timeout retry that motivated MOJ-1128 would create a second bulk job, and
because Pivotal generates each `transferId` as a fresh ULID
(`packages/apps/web-outbound/controllers/send-money.controller.ts:84`), nothing downstream would
recognise the duplicate.

**Fix.** Require a client-supplied bulk idempotency key with a DB unique constraint, checked before
enqueue; return the existing bulk id on a repeat rather than creating a new job. See **T1** — this
must be built on the same mechanism trust-manager selects for replay protection, not a parallel one.

---

## 2. Design decisions requiring a call

| # | Concern | Why it matters | Direction |
| --- | --- | --- | --- |
| D1 | **Where execution runs** | `web-outbound` is the latency-critical synchronous API; a large batch would compete for its event loop, Hub connection pool and Redis | New `bulk-worker` app mirroring `report-worker`. The domain layer is env-free and module-wired, so it can host `OutboundDomainModule` and run its own `FspiopResponseSubscriber` |
| D2 | **Result storage** | The transfer cache is deleted on completion (`put-accept-quote.handler.ts:236`) and TTL-bounded — results cannot be read back from Redis when the caller polls later | Build the `SendMoneyResponse` at item completion and persist it to `bulk_transfer_items.result` |
| D3 | **Queue granularity** | See **D4** — two independent deadlines bound a single item | One queued unit = one **whole** transfer, all three phases back to back, in one process. Do **not** build a per-phase pipeline |
| D4 | **Per-item deadline** | Two limits apply: the ILP prepare packet expires 15 min after quote (`FspConnector._15_MINUTES`), and the cached `TransferRequest` expires at `REDIS_CACHE_ITEM_TIMEOUT_MS` — **300000 (5 min) in production**. The binding constraint is the *tighter* one | An item must complete within **5 minutes** of starting phase 1 under current prod config. Queue wait must not count against it — claim late, not early. Treat this as a correctness parameter and validate the relationship at startup |
| D5 | **Crash recovery** | `report-worker` safely re-runs stale `RUNNING` jobs because regenerating a report is free. Re-driving a transfer is a double payment | An item that dies mid-`POST /transfers` goes to a terminal **INDETERMINATE** state and is reconciled from the audit tables, which already record every leg and `possible_dispute`. **Never auto-retry that phase** |
| D6 | **Concurrency** | Fully sequential is unusable. But central-ledger takes a position lock per payer FSP on prepare, so high parallelism from one payer contends on that row | Bounded parallelism, tuned by load test against the Hub — and against the HSM (see **T3**). Operational knob; validate at startup |
| D7 | **Result payload size** | "All responses in one response" does not survive a large batch | Cap batch size; paginate the results endpoint. The S3-proxy report pattern is available if large exports are needed |
| D8 | **Status endpoint authorization** | A `GET` has no body, so `AccessGuard` signs only `{ date }` — that binds neither the bulk id nor prevents replay | Explicit server-side ownership check: batch owner must equal `FSPIOP-Source`, or one DFSP can read another's transaction data |
| D9 | **Audit correlation** | Operations will investigate a batch as a unit | Add `bulk_request_id` to `transactions`; the portal's existing search, report and dashboard then filter by batch for free |
| D10 | **Naming** | `shared/fspiop/dto` already contains `bulk-transfers-post-request.ts` and `bulk-quotes-post-request.ts` — the real FSPIOP bulk primitives | This feature is Pivotal-side batching over *individual* FSPIOP transfers. Name it `bulk-sendmoney`, never `bulk-transfers` |

**Per-item duplicate protection already exists.** The Redis `SET NX PX` lock on both `PUT` handlers
(`redis-client.ts:126`, acquired at `put-accept-party.handler.ts:64` and
`put-accept-quote.handler.ts:127`) plus the `transferRequest.transfer != null` guard
(`put-accept-quote.handler.ts:155`) already prevent a duplicate money-moving dispatch per
`transferId`. Bulk inherits this at no cost.

---

## 3. Trust-manager and security compatibility

Cross-referenced against `trust-manager-docs/` (README decision register, `open-decisions.md`,
`implementation-plan.md` §3 and §5, `dfsp-integration-impact.md`).

**Headline: bulk promotes three open trust-manager items from "should fix" to "must fix first."**

### T1. Replay protection — open decision **G** — must close before bulk ships

`open-decisions.md` **G** states plainly that nothing prevents replay of a captured
`/secured/sendmoney` today: no nonce, no timestamp bound into the accessKey signature. The recommended
resolution is **`homeTransactionId` uniqueness**, chosen because it requires zero DFSP client change.

Bulk multiplies the damage of that gap by the batch size — one replayed signed envelope becomes N
payments rather than one.

**Requirement.** Bulk must **not** invent a second idempotency mechanism. The bulk envelope's
idempotency key (**B3**) and each item's `homeTransactionId` must be enforced by the same uniqueness
constraint that closes G. `SendMoneyRequest` already carries `homeTransactionId`, so the field exists;
what is missing is the constraint and the rejection path. Sequence G first, then build bulk on top of
it.

### T2. Bulk decouples authorization from execution in time — a new concern

Today every money-moving leg is individually signed by the DFSP: `dfsp-integration-impact.md` §Phase 1
step 3 requires the DFSP to sign the body of **every** `POST /secured/sendmoney` **and**
`PUT /secured/sendmoney/{transferId}`. Authorization and execution are simultaneous.

Bulk collapses N × 2 signatures into **one signature at T+0 authorizing N money movements that occur
over the following minutes or hours.** Consequences:

- **accessKey revocation stops working mid-batch.** Open decision **E** notes the accessKey has no
  emergency revocation path today; `dfsp-integration-impact.md` §Phase 4.3 promises certificate
  revocation "within seconds." Neither reaches a batch already in flight if the accessKey is checked
  only at submit.
- **`valid_to` expiry is not observed.** `implementation-plan.md` §3 makes `valid_to` **enforced** for
  `key_type = access`. A batch can outlive the key that authorized it.
- This contradicts the project's stated preference for real-time security enforcement over
  TTL-bounded staleness.

**Requirement.** Re-validate the submitting participant's accessKey status — active, unrevoked,
unexpired — at **each item's execution**, not only at submit, and fail the remaining items closed if
it has gone away. This is cheap: `PARTICIPANT_KEY_STORE_REFRESH_INTERVAL_SECONDS: "5"` in prod means
the cache is already near-real-time. Decide and document the semantics for a batch whose authorization
is revoked mid-flight (abort remaining items and mark them terminally rejected is the safe default).

### T3. HSM signing throughput — bulk is the concurrency driver

Decision 3 selects ES256 for FSPIOP JWS explicitly on signing cost "at 600–1,200 signs/sec." Decision
4 has connectors signing **remotely via an opaque keyRef**, so each signature carries a network round
trip. `implementation-plan.md` §3 warns that `shared/pkcs11` **must pool sessions**, because many
PKCS#11 implementations serialise on a single session — "size the pool to expected concurrency, not to
tenant count, and treat it as a first-class requirement."

Bulk is a burst generator: each item produces three outbound FSPIOP requests, each JWS-signed, plus
the payee-side callbacks. A 10,000-item batch is ~30,000 signatures on the payer side alone,
concentrated rather than spread.

**Requirement.** The bulk concurrency ceiling (**D6**) and the PKCS#11 session pool size are the same
capacity decision and must be made together. If bulk lands before trust-manager phase 1, its expected
burst concurrency must be a declared input to that sizing. If it lands after, the pool must be
re-sized. Do not let these be decided independently by two teams.

### T4. Fail-closed plus readiness — the worker is a gap in the current plan

Decision 19 settles that a cache miss **fails closed** and a cold pod reports **unready**, and
`implementation-plan.md` §3 adds readiness probes to `web-outbound` and `web-inbound` so a cold
replica receives no traffic — which is what makes failing closed cost nothing.

**That reasoning does not transfer to a poller.** A `bulk-worker` receives no HTTP traffic, so
readiness gating does not stop it claiming items while its participant/key cache is cold. It would
claim work and fail every item closed.

**Requirement.** The worker must not claim items until its first cache load succeeds. Additionally,
§3 specifies the cache-miss path as "one bounded synchronous re-read of the authoritative store, then
reject" — under bulk, N concurrent items missing cache produce N concurrent synchronous re-reads.
Add single-flight de-duplication per `fspId` on that path, or bulk will convert a cold cache into a
thundering herd on the authoritative store.

### T5. mTLS migration inventory

Decision 8 binds certificate identity to `FSPIOP-Source`, on the rationale that without it "a leaked
accessKey plus *any* tenant's certificate is enough to transact as the victim."

A bulk envelope carries **one** `FSPIOP-Source` for N items. Every item's `from.fspId` must be
validated against that single header at submit — the existing per-request check
(`send-money.controller.ts:53`) must be applied per item, not once per batch.

`dfsp-integration-impact.md` §Phase 3.3 already lists endpoints DFSPs must repoint at cutover. Any new
bulk endpoint must be added to that inventory now, while the document is still being drafted, rather
than discovered during migration.

### T6. Do not add NATS subjects

Open decision **C** flags that "the request subjects are an injection path today, under every signing
option," and NATS authorization scope is unsettled.

Driving the three existing commands in-process via `CommandBus` introduces **no new subject family**.
Keep it that way — do not add a bulk-specific NATS subject while C is open. The work-distribution
mechanism should be the database (`SELECT … FOR UPDATE SKIP LOCKED` or the status-CAS the
report-worker already uses), not a new stream.

### T7. Sequencing

| Order | Item | Reason |
| --- | --- | --- |
| 1 | Close open decision **G** and land `homeTransactionId` uniqueness | Bulk multiplies replay damage by N (**T1**) |
| 2 | Land **B1** subscriber fix as its own PR | Standalone correctness fix; benefits the existing API; watch in staging independently |
| 3 | Decide **T2** revocation semantics and **T3** concurrency/pool sizing | Both are cross-team inputs, not implementation details |
| 4 | Build bulk | |

Bulk does **not** need to wait for full trust-manager rollout. It needs G closed, and its concurrency
ceiling declared as an input to phases 1 and 3.

---

## 4. Business control removed by auto-accept

The three-call flow exists so the payer confirms **the resolved payee** and **the quoted fee** before
money moves. `acceptParty=true, acceptQuote=true` deletes both checks.

- Payee validation must move upstream into whatever produces the batch file.
- **Nothing bounds what the payee FSP quotes.** `PutAcceptQuoteHandler` will accept and pay whatever
  `transferAmount` comes back. A per-item expected-amount and maximum-fee tolerance must be checked
  before auto-accepting, failing the item rather than paying outside it. Without this, a misbehaving
  or compromised payee FSP can inflate fees across an entire unattended batch.

The natural place is in `PutAcceptPartyCommand` handling, immediately after the quote callback
resolves and before the transfer phase begins.

### Verified: `STRICT_AMOUNT_TYPE` is dead configuration

`prod-hub-guinea-gitops/apps/pivotal/values.yaml:435` and
`stg-hub-guinea-gitops/apps/pivotal/values.yaml:413` set:

```yaml
STRICT_AMOUNT_TYPE: "true" # Check amountType against subScenario
```

on `webOutbound.env`. A repository-wide search across `pivotal`, all Java connectors,
`pivotal-connector-nestjs` and the Helm charts finds **no consumer** — no TypeScript reference, no
Java reference, no chart template. The variable is injected into the container and read by nothing.

This matters here because it is a plausible thing to *believe* is providing an amount-validation
control at exactly the moment auto-accept removes human review. Confirm whether the check was
intended and lost, or was never implemented — then either implement it or remove the setting from both
environments. `DECIMAL_PLACES: "0"` on the same block **is** live (`AmountDecimalValidator`) and is
doing real work for Guinea; do not conflate the two.

---

## 5. Runtime shape, for reference

Assuming **D1** (separate worker):

1. **Submit** — any `web-outbound` replica. `AccessGuard` verifies the envelope; each item is
   validated and its `from.fspId` checked against `FSPIOP-Source`; idempotency key checked; rows
   written to `bulk_requests` (1) and `bulk_transfer_items` (N), **each item's `transferId` ULID
   generated now**. Responds `202`. The replica retains nothing.
2. **Claim** — worker replicas claim item *rows*, not batches. A batch spreads across all workers.
3. **Execute** — per item, in one process, back to back: `PostSendMoneyCommand` →
   `PutAcceptPartyCommand` → `PutAcceptQuoteCommand`. The waiter for each phase lives in the memory of
   the process that made that phase's HTTP call, which is why an item cannot be split across
   processes. Must finish inside the 5-minute cache deadline (**D4**).
4. **Persist** — the `SendMoneyResponse` is written to the item row on completion.
5. **Poll** — status and results are pure DB reads from any replica, with an ownership check (**D8**).

Generating `transferId` at submit rather than at execution is what makes recovery safe: a re-driven
item reuses its id, so the Hub sees a duplicate rather than a new payment.

---

## 6. Open questions for the team

1. Is a maximum batch size agreed? It determines the guard CPU cap (**B2**), the response shape
   (**D7**) and the HSM burst sizing (**T3**).
2. What is the expected end-to-end SLA for a batch, and does it tolerate the 5-minute per-item
   deadline (**D4**) under queue depth?
3. Who is accountable for the fee tolerance policy in §4 — is it per-DFSP configuration, per-batch
   client input, or a global ceiling?
4. On mid-batch accessKey revocation (**T2**): abort remaining items, or complete the batch?
5. Does the ALS collapse identical concurrent `GET /parties`? If it returns one callback for two
   requests, the surviving mitigation is intra-batch lookup de-duplication — collapsing duplicate
   `(payeeFsp, idType, idValue)` lookups to a single call and fanning the result to all items that
   share it. Worth building regardless, since it also cuts Hub load.

---

## Appendix — evidence

| Claim | Location |
| --- | --- |
| Waiter map keyed by subject, single entry | `packages/shared/fspiop/component/nats/fspiop-response-subscriber.ts:57`, `:161` |
| `cancel` resolves by subject, not by entry | same, `:184` |
| 30s waiter timeout | same, `:51` |
| Shutdown cancels without settling promises | same, `:107` |
| Response stream is `LimitsPolicy`, 60s max age | `packages/shared/fspiop/component/nats/fspiop-response-stream.resolver.ts` |
| Parties subject keyed by resource path | `packages/shared/fspiop/component/fspiop-pub-sub-subjects.ts` |
| `quoteId = transferId` (so quotes/transfers subjects are unique) | `packages/core/outbound/domain/command/put-accept-party.handler.ts:256` |
| Array bodies bypass body signing | `packages/apps/web-outbound/component/access.guard.ts:110`, `:115` |
| `transferId` generated per request | `packages/apps/web-outbound/controllers/send-money.controller.ts:84` |
| Transfer cache deleted on completion | `packages/core/outbound/domain/command/put-accept-quote.handler.ts:236` |
| In-flight lock + duplicate guard | `packages/core/outbound/domain/component/redis-client.ts:126`; `put-accept-quote.handler.ts:127`, `:155` |
| Connector durables derived from tenant | `packages/core/connector/consumer/listener/connector-post-transfers.listener.ts:69` |
| ILP quote lifetime 15 minutes | `packages/core/connector/domain/component/fsp-connector.ts` (`_15_MINUTES`) |
| Prod: 5 web-outbound replicas, 5-min cache TTL, 5s key refresh | `prod-hub-guinea-gitops/apps/pivotal/values.yaml` |
| `STRICT_AMOUNT_TYPE` has no consumer | repository-wide search; set only in prod/stg `values.yaml` |
| Replay protection unresolved | `trust-manager-docs/open-decisions.md` §G |
| accessKey revocation unresolved | `trust-manager-docs/README.md` decision register, open item **E** |
| PKCS#11 session pool sizing requirement | `trust-manager-docs/implementation-plan.md` §3 |
| Fail-closed + readiness gating | `trust-manager-docs/README.md` decision 19; `implementation-plan.md` §3 |
| DFSP signs every POST and PUT today | `trust-manager-docs/dfsp-integration-impact.md` §Phase 1.3 |

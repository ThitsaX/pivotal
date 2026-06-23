# Pivotal Hub Dashboard — How Data Reaches the Rollup

Visual walkthrough of how a live payment becomes a number on the dashboard.

> These diagrams use **Mermaid**. They render automatically on GitHub/GitLab, in VS Code (with a Mermaid preview extension), or at <https://mermaid.live>.

## 1. End-to-end pipeline

```mermaid
flowchart TD
    A["Live payment / FSPIOP flow<br/><i>money path — never touched</i>"]
    B[("NATS audit stream<br/>subject: audit.>")]
    C["app-auditor<br/>(consumer)"]
    D[("transactions<br/>raw table · MySQL")]
    H[("transaction_hourly_rollup<br/>summary · MySQL")]
    I["Dashboard<br/>today · 7d · 30d · value · errors by stage"]

    A -->|emits audit events| B
    B -->|consumed asynchronously| C
    C -->|1 row per transaction| D

    subgraph REFRESH["Rollup refresh · every ~5 min · ONE replica (Redis lock)"]
        E["① SELECT rows in last 3h<br/>② GROUP BY hour, payer, payee, currency"]
        F["③ DELETE that window + INSERT fresh buckets<br/>(one transaction on primary)"]
        E --> F
    end

    D -.->|read replica| E
    F --> H
    H -->|SUM over buckets| I
```

## 2. One refresh cycle (why only one replica runs)

```mermaid
sequenceDiagram
    autonumber
    participant T as Timer<br/>(each replica, ~5 min)
    participant R as Redis<br/>(lock)
    participant DBr as transactions<br/>(read replica)
    participant DBw as rollup<br/>(primary)

    T->>R: SET lock NX PX  (try to be leader)
    alt lock acquired
        R-->>T: OK (token)
        T->>DBr: SELECT rows in last 3h
        DBr-->>T: raw rows
        Note over T: GROUP BY hour, payer, payee, currency
        T->>DBw: DELETE window + INSERT buckets (one txn)
        T->>R: release lock
    else held by another replica / Redis down
        R-->>T: null
        Note over T: skip this tick · retry next time<br/>(safe — refresh is idempotent)
    end
```

## 3. What GROUP BY does — many raw rows collapse into one bucket

```mermaid
flowchart LR
    subgraph RAW["RAW transactions · hour 07:00 · wallet1 → wallet2 · USD"]
        r1["07:00:20 · COMMITTED · amount 15"]
        r2["07:01:05 · COMMITTED · amount 10"]
        r3["07:02:26 · error · parties_error"]
        r4["07:02:40 · error · parties_error"]
    end

    BUCKET["Bucket 07:00<br/>txn_count = 4<br/>errors = 2 · parties_error = 2<br/>committed_amount = 25 (15 + 10)"]

    RAW -->|"GROUP BY hour, payer, payee, currency"| BUCKET
```

*4 raw rows → 1 summary row. `committed_amount` counts only money that moved (the two failures are excluded).*

## 4. Why re-read a window and replace it

```mermaid
flowchart LR
    A["Transfer starts 07:59<br/>state = RESERVED"] --> B["settles 08:01<br/>state = COMMITTED"]
    B --> C["next refresh re-reads the<br/>3h window and recomputes<br/>the bucket → self-corrects"]
```

A transfer can start in one hour and finish in the next, so each refresh recomputes a fixed trailing window and **replaces** those buckets (delete + re-insert) rather than adding to them. Once a bucket ages out of the window it is sealed. On a brand-new/empty rollup, a one-time **startup backfill** fills the full 30 days first so history is never missing.

## 5. One tick, end to end — the actual queries

Every ~5 min, one replica (the Redis-lock winner) runs the cycle below. The whole thing is **replace the window**: SELECT-aggregate a fixed 3-hour span, then DELETE + INSERT that *same* span.

**Step 1–2 · compute the window** (hour-aligned UTC; not literally `NOW()-3h`):

```
window_end   = current_hour + 1h     (start of the next hour — exclusive; includes the open hour)
window_start = window_end − 3h        (= current_hour − 2h)
```

At 09:41 → window = `[2026-06-22 07:00:00, 2026-06-22 10:00:00)`.

**Step 3 · SELECT-aggregate `transactions` over the window** (the read leg, on the replica). Say it returns two buckets — same hour/payer/payee, different currency:

```json
[
  { "bucket_hour": "2026-06-22 09:00:00", "payer_fsp": "wallet1", "payee_fsp": "wallet2", "currency": "USD",
    "txn_count": 4, "error_count": 1, "dispute_count": 0,
    "parties_error_count": 0, "quotes_error_count": 0, "transfers_error_count": 1, "patch_error_count": 0,
    "committed_amount": 1502.0000, "committed_count": 3, "latency_count": 4, "sum_latency_ms": 76126.0000 },

  { "bucket_hour": "2026-06-22 09:00:00", "payer_fsp": "wallet1", "payee_fsp": "wallet2", "currency": "XXX",
    "txn_count": 4, "error_count": 2, "dispute_count": 0,
    "parties_error_count": 2, "quotes_error_count": 0, "transfers_error_count": 0, "patch_error_count": 0,
    "committed_amount": 0.0000, "committed_count": 0, "latency_count": 2, "sum_latency_ms": 239.0000 }
]
```

**Step 4 · DELETE the rollup over the SAME window** (not a shifted one — `window_start` already equals `current_hour − 2h`). Half-open range, never SQL `BETWEEN`:

```sql
DELETE FROM transaction_hourly_rollup
WHERE bucket_hour >= '2026-06-22 07:00:00'   -- window_start (inclusive)
  AND bucket_hour <  '2026-06-22 10:00:00';  -- window_end   (exclusive)
```

This clears **all** buckets in the 3-hour span, including 07:00/08:00 buckets from the previous tick — whatever the fresh SELECT returns becomes the new truth.

**Step 5 · INSERT the selected rows** (the write leg). `updated_at` is stamped now (the dashboard's `asOf`); `USD` and `XXX` stay separate rows because `currency` is part of the primary key:

```sql
INSERT INTO transaction_hourly_rollup
    (bucket_hour, payer_fsp, payee_fsp, currency,
     txn_count, error_count, dispute_count,
     parties_error_count, quotes_error_count, transfers_error_count, patch_error_count,
     committed_amount, committed_count, latency_count, sum_latency_ms, updated_at)
VALUES
    ('2026-06-22 09:00:00', 'wallet1', 'wallet2', 'USD',
     4, 1, 0,  0, 0, 1, 0,  1502.0000, 3, 4, 76126.0000, '2026-06-22 09:41:07'),
    ('2026-06-22 09:00:00', 'wallet1', 'wallet2', 'XXX',
     4, 2, 0,  2, 0, 0, 0,  0.0000, 0, 2, 239.0000, '2026-06-22 09:41:07');
```

Steps 4 + 5 run inside **one transaction on the primary**, so a dashboard read never sees a half-rebuilt window. The next tick repeats the same DELETE + INSERT over `[07:00, 10:00)`; once the clock passes 12:00 the 09:00 bucket leaves the window and is sealed.

> The `XXX` bucket stays in the table and still counts toward activity (`txn_count`, `error_count`, latency), but `getValueByCurrency` filters `currency <> 'XXX'` so it never inflates the money view — the activity-vs-money split.

## In one line

**Live payment → NATS audit → `transactions` (raw, 1 row each) → 5-min GROUP BY into hourly buckets → `transaction_hourly_rollup` → dashboard sums.** Redis only picks which replica runs the refresh.

-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 ThitsaWorks
-- Pre-aggregated hourly summary of `transactions`, powering the portal dashboard.
--
-- One row per (hour, payer, payee, currency). A scheduled job folds raw `transactions`
-- rows into this table by RE-AGGREGATING a bounded trailing window and OVERWRITING the
-- affected buckets (never accumulating) — raw rows mutate after first insert (error flips,
-- completed_at fills in, possible_dispute flips), so each run recomputes the window from
-- scratch and is self-correcting.
--
-- Outcome is derived from the `error` flag, NOT `transfer_state` (which is only ever
-- COMMITTED or NULL and unreliable): a transaction is COMMITTED when error = 0 and ERROR
-- when error = 1. `error_count` therefore drives both the success rate and the
-- committed-vs-error split (committed = txn_count - error_count). The four stage counters
-- break errors down by where they occurred — a stage's *_error column is non-null only
-- when that stage failed, and exactly one stage fails per errored transaction.
--
-- Hourly grain is finer than the re-aggregation window, so recent buckets can be
-- overwritten without corrupting sealed older ones. Daily / 7d / 30d tiles roll *up*
-- from these hourly buckets at read time. `bucket_hour` is UTC, truncated to the hour
-- from `transaction_started_at`.
--
-- Money reflects VALUE THAT MOVED, not value attempted: `committed_amount` /
-- `committed_count` only count transfers the payer + hub committed — `transfer_state =
-- 'COMMITTED' OR possible_dispute = 1`. A dispute means payer-debit + hub-commit succeeded
-- and only the payee-credit leg failed, so the funds left the payer and still count. Failed
-- transfers (e.g. insufficient liquidity, rejected quotes) moved no money and are excluded,
-- even though their `transfer_amount` may be populated from the quote. Money is per-currency;
-- counts / rates / latency are currency-agnostic and summed across buckets.
CREATE TABLE IF NOT EXISTS `transaction_hourly_rollup` (
    `bucket_hour`           DATETIME       NOT NULL,
    `payer_fsp`             VARCHAR(32)    NOT NULL,
    `payee_fsp`             VARCHAR(32)    NOT NULL,
    `currency`              VARCHAR(3)     NOT NULL,
    `txn_count`             BIGINT         NOT NULL DEFAULT 0,
    `error_count`           BIGINT         NOT NULL DEFAULT 0,
    `dispute_count`         BIGINT         NOT NULL DEFAULT 0,
    -- Per-stage error counters; each errored transaction contributes to exactly one.
    `parties_error_count`   BIGINT         NOT NULL DEFAULT 0,
    `quotes_error_count`    BIGINT         NOT NULL DEFAULT 0,
    `transfers_error_count` BIGINT         NOT NULL DEFAULT 0,
    `patch_error_count`     BIGINT         NOT NULL DEFAULT 0,
    -- Value that moved: committed (incl. disputed) transfers only. See header note.
    `committed_amount`      DECIMAL(34, 4) NOT NULL DEFAULT 0,
    `committed_count`       BIGINT         NOT NULL DEFAULT 0,
    -- `latency_count` is the number of rows that contributed to `sum_latency_ms` (i.e. those
    -- with a non-null `transaction_completed_at`). Average latency = sum_latency_ms / latency_count;
    -- dividing by `txn_count` would be wrong because not every transaction has completed.
    `latency_count`         BIGINT         NOT NULL DEFAULT 0,
    `sum_latency_ms`        BIGINT,
    `updated_at`            DATETIME(6)    NOT NULL,
    PRIMARY KEY (`bucket_hour`, `payer_fsp`, `payee_fsp`, `currency`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Dashboard reads scan a time range (today / 7d / 30d) then group; the PK's leading
-- `bucket_hour` already serves the range seek. A dedicated currency-leading index
-- supports per-currency "value transferred" tiles that span the full window.
CREATE INDEX `transaction_hourly_rollup_01_idx`
    ON `transaction_hourly_rollup` (`currency`, `bucket_hour`);

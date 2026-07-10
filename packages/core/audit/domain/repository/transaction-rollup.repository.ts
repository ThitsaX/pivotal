// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {Transaction} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

/**
 * Maintains `transaction_hourly_rollup` — the pre-aggregated summary that powers the
 * portal dashboard — by RE-AGGREGATING a bounded trailing window on every run.
 *
 * Design notes:
 *  - **Read on the replica, write on the primary.** The heavy `GROUP BY` scan runs on
 *    `pivotal_read`; only the small set of computed buckets is written to `pivotal_write`.
 *  - **Replace, don't upsert.** Each run DELETEs the window's buckets and re-INSERTs the
 *    freshly computed ones, inside one write transaction. Raw rows mutate after first insert
 *    (`error` flips, `completed_at` fills in, `possible_dispute` flips), so a bucket's measures
 *    change over time; recomputing the whole window and replacing it is exact and fully
 *    self-correcting, and also clears buckets whose last transaction aged out of the window.
 *  - Raw SQL via `Repository.query()`, mirroring {@link TransactionRepository.upsert}; no
 *    dedicated entity is needed for the rollup table.
 */
@Injectable()
export class TransactionRollupRepository {

    constructor(
        @InjectRepository(Transaction, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<Transaction>,
        @InjectRepository(Transaction, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<Transaction>,
    ) {
    }

    /**
     * Recomputes every hourly bucket whose `bucket_hour` falls in `[windowStart, windowEnd)`.
     * `windowStart`/`windowEnd` MUST be hour-truncated UTC boundaries.
     */
    async reaggregateWindow(windowStart: Date, windowEnd: Date): Promise<TransactionRollupRepository.Result> {
        const rows = await this.aggregateWindow(windowStart, windowEnd);
        await this.replaceWindow(windowStart, windowEnd, rows);

        return {bucketsWritten: rows.length};
    }

    /**
     * Heavy read leg — runs the `GROUP BY` on the read replica.
     *
     * Outcome is derived from the `error` flag (not `transfer_state`): `error_count` is the
     * ERROR slice, and the per-stage `*_error IS NOT NULL` counters attribute each error to the
     * stage that failed. NULL handling keeps every transaction counted while satisfying the
     * rollup's NOT NULL key columns: `currency` falls back transfer → quoting → 'XXX' (ISO "no
     * currency"). Money counts VALUE THAT MOVED only — `committed_amount`/`committed_count` sum
     * transfers where `transfer_state = 'COMMITTED' OR possible_dispute = 1` (a dispute still
     * debited the payer + committed at the hub); failed/rejected transfers are excluded.
     */
    private async aggregateWindow(
        windowStart: Date,
        windowEnd: Date,
    ): Promise<TransactionRollupRepository.RollupRow[]> {
        const rows = await this.readRepository.query(
            `SELECT
                DATE_FORMAT(transaction_started_at, '%Y-%m-%d %H:00:00')        AS bucket_hour,
                payer_fsp                                                       AS payer_fsp,
                payee_fsp                                                       AS payee_fsp,
                COALESCE(transfer_currency, quoting_currency, 'XXX')            AS currency,
                COUNT(*)                                                        AS txn_count,
                SUM(error)                                                      AS error_count,
                SUM(possible_dispute)                                           AS dispute_count,
                SUM(parties_error    IS NOT NULL)                               AS parties_error_count,
                SUM(quotes_error     IS NOT NULL)                               AS quotes_error_count,
                SUM(transfers_error  IS NOT NULL)                               AS transfers_error_count,
                SUM(patch_error      IS NOT NULL)                               AS patch_error_count,
                COALESCE(SUM(CASE WHEN transfer_state = 'COMMITTED' OR possible_dispute = 1
                                  THEN transfer_amount ELSE 0 END), 0)         AS committed_amount,
                SUM(CASE WHEN transfer_state = 'COMMITTED' OR possible_dispute = 1
                         THEN 1 ELSE 0 END)                                     AS committed_count,
                SUM(transaction_completed_at IS NOT NULL)                       AS latency_count,
                SUM(TIMESTAMPDIFF(MICROSECOND, transaction_started_at, transaction_completed_at) / 1000)
                                                                                AS sum_latency_ms
             FROM transactions
             WHERE transaction_started_at >= ?
               AND transaction_started_at <  ?
             GROUP BY bucket_hour, payer_fsp, payee_fsp, currency`,
            [windowStart, windowEnd],
        );

        return rows as TransactionRollupRepository.RollupRow[];
    }

    /**
     * Atomic write leg — DELETE the window then bulk-INSERT the recomputed buckets, in one
     * transaction so a dashboard read never observes a half-rebuilt (or empty) window. When the
     * window has no transactions the DELETE still runs, clearing any now-empty buckets.
     */
    private async replaceWindow(
        windowStart: Date,
        windowEnd: Date,
        rows: TransactionRollupRepository.RollupRow[],
    ): Promise<void> {
        await this.writeRepository.manager.transaction(async (manager) => {
            await manager.query(
                `DELETE FROM transaction_hourly_rollup WHERE bucket_hour >= ? AND bucket_hour < ?`,
                [windowStart, windowEnd],
            );

            if (rows.length === 0) {
                return;
            }

            const now = new Date();
            const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            const values: unknown[] = [];

            for (const row of rows) {
                values.push(
                    row.bucket_hour,
                    row.payer_fsp,
                    row.payee_fsp,
                    row.currency,
                    Number(row.txn_count),
                    Number(row.error_count ?? 0),
                    Number(row.dispute_count ?? 0),
                    Number(row.parties_error_count ?? 0),
                    Number(row.quotes_error_count ?? 0),
                    Number(row.transfers_error_count ?? 0),
                    Number(row.patch_error_count ?? 0),
                    row.committed_amount ?? 0,
                    Number(row.committed_count ?? 0),
                    Number(row.latency_count ?? 0),
                    row.sum_latency_ms == null ? null : Number(row.sum_latency_ms),
                    now,
                );
            }

            await manager.query(
                `INSERT INTO transaction_hourly_rollup
                    (bucket_hour, payer_fsp, payee_fsp, currency,
                     txn_count, error_count, dispute_count,
                     parties_error_count, quotes_error_count, transfers_error_count, patch_error_count,
                     committed_amount, committed_count, latency_count, sum_latency_ms, updated_at)
                 VALUES ${placeholders}`,
                values,
            );
        });
    }

    // ─── Dashboard reads ──────────────────────────────────────────────────────────────────
    // Small indexed scans over `transaction_hourly_rollup` (never the raw `transactions`
    // table). `scopeFspId` applies DFSP row-scoping: a transaction is exactly one rollup row,
    // so `(payer_fsp = fsp OR payee_fsp = fsp)` counts each once with no double-counting.

    async getTotals(
        scopeFspId: string | undefined,
        ranges: TransactionRollupRepository.Ranges,
    ): Promise<TransactionRollupRepository.Totals> {
        const scope = TransactionRollupRepository.scopeClause(scopeFspId);
        const rows = await this.readRepository.query(
            `SELECT
                COALESCE(SUM(CASE WHEN bucket_hour >= ? THEN txn_count END), 0)     AS today,
                COALESCE(SUM(CASE WHEN bucket_hour >= ? THEN txn_count END), 0)     AS last7d,
                COALESCE(SUM(txn_count), 0)                                         AS last30d,
                COALESCE(SUM(CASE WHEN bucket_hour >= ? THEN dispute_count END), 0) AS disputes_today,
                COALESCE(SUM(CASE WHEN bucket_hour >= ? THEN error_count END), 0)   AS errors_today
             FROM transaction_hourly_rollup
             WHERE bucket_hour >= ? AND bucket_hour < ?${scope.clause}`,
            [
                ranges.todayFrom, ranges.sevenFrom, ranges.todayFrom, ranges.todayFrom,
                ranges.thirtyFrom, ranges.to, ...scope.params,
            ],
        );
        const row = rows[0] ?? {};

        return {
            today: Number(row.today ?? 0),
            last7d: Number(row.last7d ?? 0),
            last30d: Number(row.last30d ?? 0),
            disputesToday: Number(row.disputes_today ?? 0),
            errorsToday: Number(row.errors_today ?? 0),
        };
    }

    /**
     * Errors attributed by the pipeline stage that failed, over `[from, to)`. Always returns the
     * four stages in pipeline order (zero-count stages included) so the chart axis is stable.
     */
    async getErrorStageBreakdown(
        scopeFspId: string | undefined,
        from: Date,
        to: Date,
    ): Promise<TransactionRollupRepository.StageCount[]> {
        const scope = TransactionRollupRepository.scopeClause(scopeFspId);
        const rows = await this.readRepository.query(
            `SELECT COALESCE(SUM(parties_error_count), 0)   AS parties,
                    COALESCE(SUM(quotes_error_count), 0)    AS quotes,
                    COALESCE(SUM(transfers_error_count), 0) AS transfers,
                    COALESCE(SUM(patch_error_count), 0)     AS patch
             FROM transaction_hourly_rollup
             WHERE bucket_hour >= ? AND bucket_hour < ?${scope.clause}`,
            [from, to, ...scope.params],
        );
        const row = rows[0] ?? {};

        return [
            {stage: 'Parties',   count: Number(row.parties ?? 0)},
            {stage: 'Quotes',    count: Number(row.quotes ?? 0)},
            {stage: 'Transfers', count: Number(row.transfers ?? 0)},
            {stage: 'Patch',     count: Number(row.patch ?? 0)},
        ];
    }

    async getValueByCurrency(
        scopeFspId: string | undefined,
        from: Date,
        to: Date,
    ): Promise<TransactionRollupRepository.CurrencyValue[]> {
        const scope = TransactionRollupRepository.scopeClause(scopeFspId);
        // Value that moved, per currency: committed (incl. disputed) transfers only. 'XXX' is the
        // no-currency placeholder for pre-financial failures (e.g. party-lookup) — never money.
        const rows = await this.readRepository.query(
            `SELECT currency,
                    COALESCE(SUM(committed_amount), 0) AS total_amount,
                    COALESCE(SUM(committed_count), 0)  AS txn_count
             FROM transaction_hourly_rollup
             WHERE bucket_hour >= ? AND bucket_hour < ? AND currency <> 'XXX'${scope.clause}
             GROUP BY currency
             HAVING txn_count > 0
             ORDER BY total_amount DESC`,
            [from, to, ...scope.params],
        );

        return rows.map((row: Record<string, unknown>) => ({
            currency: String(row.currency),
            totalAmount: String(row.total_amount ?? '0'),   // keep DECIMAL precision as string
            txnCount: Number(row.txn_count ?? 0),
        }));
    }

    async getTopFsps(
        scopeFspId: string | undefined,
        leg: TransactionRollupRepository.FspLeg,
        from: Date,
        to: Date,
        limit: number,
    ): Promise<TransactionRollupRepository.FspCount[]> {
        const scope = TransactionRollupRepository.scopeClause(scopeFspId);
        // `leg` is a fixed enum literal (never user input), safe to interpolate as a column.
        const rows = await this.readRepository.query(
            `SELECT ${leg} AS fsp_id, COALESCE(SUM(txn_count), 0) AS count
             FROM transaction_hourly_rollup
             WHERE bucket_hour >= ? AND bucket_hour < ?${scope.clause}
             GROUP BY ${leg}
             ORDER BY count DESC
             LIMIT ?`,
            [from, to, ...scope.params, limit],
        );

        return rows.map((row: Record<string, unknown>) => ({
            fspId: String(row.fsp_id),
            count: Number(row.count ?? 0),
        }));
    }

    async getAvgLatencyMs(
        scopeFspId: string | undefined,
        from: Date,
        to: Date,
    ): Promise<number | null> {
        const scope = TransactionRollupRepository.scopeClause(scopeFspId);
        const rows = await this.readRepository.query(
            `SELECT SUM(sum_latency_ms) AS sum_latency, SUM(latency_count) AS latency_count
             FROM transaction_hourly_rollup
             WHERE bucket_hour >= ? AND bucket_hour < ?${scope.clause}`,
            [from, to, ...scope.params],
        );
        const row = rows[0] ?? {};
        const sumLatency = row.sum_latency == null ? null : Number(row.sum_latency);
        const latencyCount = Number(row.latency_count ?? 0);

        if (sumLatency == null || latencyCount === 0) {
            return null;
        }

        return sumLatency / latencyCount;
    }

    async getDailyTrend(
        scopeFspId: string | undefined,
        from: Date,
        to: Date,
    ): Promise<TransactionRollupRepository.DailyCount[]> {
        const scope = TransactionRollupRepository.scopeClause(scopeFspId);
        const rows = await this.readRepository.query(
            `SELECT DATE(bucket_hour)                  AS day,
                    COALESCE(SUM(txn_count), 0)        AS count,
                    COALESCE(SUM(error_count), 0)      AS error_count,
                    COALESCE(SUM(dispute_count), 0)    AS dispute_count
             FROM transaction_hourly_rollup
             WHERE bucket_hour >= ? AND bucket_hour < ?${scope.clause}
             GROUP BY day
             ORDER BY day ASC`,
            [from, to, ...scope.params],
        );

        return rows.map((row: Record<string, unknown>) => ({
            date: TransactionRollupRepository.toIsoDate(row.day),
            count: Number(row.count ?? 0),
            errorCount: Number(row.error_count ?? 0),
            disputeCount: Number(row.dispute_count ?? 0),
        }));
    }

    /**
     * Today's intraday profile — one row per UTC hour that has data in `[from, to)`.
     * Hours with no transactions are simply absent; the caller pads to a full 0..23 axis.
     */
    async getHourlyToday(
        scopeFspId: string | undefined,
        from: Date,
        to: Date,
    ): Promise<TransactionRollupRepository.HourlyCount[]> {
        const scope = TransactionRollupRepository.scopeClause(scopeFspId);
        const rows = await this.readRepository.query(
            `SELECT HOUR(bucket_hour)               AS hour,
                    COALESCE(SUM(txn_count), 0)     AS count,
                    COALESCE(SUM(error_count), 0)   AS error_count
             FROM transaction_hourly_rollup
             WHERE bucket_hour >= ? AND bucket_hour < ?${scope.clause}
             GROUP BY hour
             ORDER BY hour ASC`,
            [from, to, ...scope.params],
        );

        return rows.map((row: Record<string, unknown>) => ({
            hour: Number(row.hour ?? 0),
            count: Number(row.count ?? 0),
            errorCount: Number(row.error_count ?? 0),
        }));
    }

    /** Per-day average latency (ms) over `[from, to)`; days with no completed transfers are absent. */
    async getDailyLatency(
        scopeFspId: string | undefined,
        from: Date,
        to: Date,
    ): Promise<TransactionRollupRepository.LatencyPoint[]> {
        const scope = TransactionRollupRepository.scopeClause(scopeFspId);
        const rows = await this.readRepository.query(
            `SELECT DATE(bucket_hour)        AS day,
                    SUM(sum_latency_ms)      AS sum_latency,
                    SUM(latency_count)       AS latency_count
             FROM transaction_hourly_rollup
             WHERE bucket_hour >= ? AND bucket_hour < ?${scope.clause}
             GROUP BY day
             ORDER BY day ASC`,
            [from, to, ...scope.params],
        );

        return rows.map((row: Record<string, unknown>) => {
            const sumLatency = row.sum_latency == null ? null : Number(row.sum_latency);
            const latencyCount = Number(row.latency_count ?? 0);

            return {
                date: TransactionRollupRepository.toIsoDate(row.day),
                avgLatencyMs: sumLatency == null || latencyCount === 0 ? null : sumLatency / latencyCount,
            };
        });
    }

    /** Rollup freshness — the most recent refresh time, used as the dashboard `asOf` stamp. */
    async getLastUpdatedAt(): Promise<Date | null> {
        const rows = await this.readRepository.query(
            `SELECT MAX(updated_at) AS last_updated FROM transaction_hourly_rollup`,
        );
        const value = rows[0]?.last_updated;

        return value == null ? null : new Date(value as string);
    }

    // ─── Live tier (near-real-time) ─────────────────────────────────────────────────────────

    /**
     * Reads the current flag state of a single transaction (by `correlation_id`) for the live
     * writer to classify. A point lookup on the unique index (`transactions_08_uk`); returns
     * `null` if the row does not exist yet. Stage flags are reduced to booleans (`IS NOT NULL`)
     * and latency is precomputed in ms, mirroring the rollup's aggregation expressions exactly.
     */
    async findLiveClassification(
        correlationId: string,
    ): Promise<TransactionRollupRepository.LiveClassificationRecord | null> {
        const rows = await this.readRepository.query(
            `SELECT payer_fsp              AS payer_fsp,
                    payee_fsp              AS payee_fsp,
                    transaction_started_at AS started_at,
                    updated_at             AS updated_at,
                    error                  AS error,
                    possible_dispute       AS possible_dispute,
                    (parties_error    IS NOT NULL) AS parties_error,
                    (quotes_error     IS NOT NULL) AS quotes_error,
                    (transfers_error  IS NOT NULL) AS transfers_error,
                    (patch_error      IS NOT NULL) AS patch_error,
                    CASE WHEN transaction_completed_at IS NOT NULL
                         THEN TIMESTAMPDIFF(MICROSECOND, transaction_started_at, transaction_completed_at) / 1000
                         ELSE NULL END             AS latency_ms
             FROM transactions
             WHERE correlation_id = ?
             LIMIT 1`,
            [correlationId],
        );
        const row = rows[0];

        if (row == null) {
            return null;
        }

        return {
            payerFsp: String(row.payer_fsp),
            payeeFsp: String(row.payee_fsp),
            startedAt: row.started_at instanceof Date ? row.started_at : new Date(row.started_at as string),
            updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at as string),
            error: Number(row.error) === 1,
            possibleDispute: Number(row.possible_dispute) === 1,
            partiesError: Number(row.parties_error) === 1,
            quotesError: Number(row.quotes_error) === 1,
            transfersError: Number(row.transfers_error) === 1,
            patchError: Number(row.patch_error) === 1,
            latencyMs: row.latency_ms == null ? null : Number(row.latency_ms),
        };
    }

    /**
     * Authoritative "today" totals for one scope, summed from the rollup buckets — the source
     * of truth the 5-minute reconciliation writes onto the live counters. `scopeFspId`
     * undefined ⇒ hub-wide; otherwise the `(payer OR payee)` DFSP scope, matching the reads.
     */
    async getLiveTotals(
        scopeFspId: string | undefined,
        from: Date,
        to: Date,
    ): Promise<TransactionRollupRepository.LiveTotals> {
        const scope = TransactionRollupRepository.scopeClause(scopeFspId);
        const rows = await this.readRepository.query(
            `SELECT COALESCE(SUM(txn_count), 0)                 AS txn,
                    COALESCE(SUM(txn_count - error_count), 0)   AS success,
                    COALESCE(SUM(error_count), 0)               AS error,
                    COALESCE(SUM(dispute_count), 0)             AS dispute,
                    COALESCE(SUM(parties_error_count), 0)       AS parties_error,
                    COALESCE(SUM(quotes_error_count), 0)        AS quotes_error,
                    COALESCE(SUM(transfers_error_count), 0)     AS transfers_error,
                    COALESCE(SUM(patch_error_count), 0)         AS patch_error,
                    COALESCE(SUM(latency_count), 0)             AS latency_count,
                    COALESCE(SUM(sum_latency_ms), 0)            AS sum_latency_ms
             FROM transaction_hourly_rollup
             WHERE bucket_hour >= ? AND bucket_hour < ?${scope.clause}`,
            [from, to, ...scope.params],
        );
        const row = rows[0] ?? {};

        return {
            txn: Number(row.txn ?? 0),
            success: Number(row.success ?? 0),
            error: Number(row.error ?? 0),
            dispute: Number(row.dispute ?? 0),
            partiesError: Number(row.parties_error ?? 0),
            quotesError: Number(row.quotes_error ?? 0),
            transfersError: Number(row.transfers_error ?? 0),
            patchError: Number(row.patch_error ?? 0),
            latencyCount: Number(row.latency_count ?? 0),
            sumLatencyMs: Number(row.sum_latency_ms ?? 0),
        };
    }

    /** Distinct FSPs (either leg) with buckets in `[from, to)` — the scopes to reconcile today. */
    async getActiveFsps(from: Date, to: Date): Promise<string[]> {
        const rows = await this.readRepository.query(
            `SELECT payer_fsp AS fsp FROM transaction_hourly_rollup WHERE bucket_hour >= ? AND bucket_hour < ?
             UNION
             SELECT payee_fsp AS fsp FROM transaction_hourly_rollup WHERE bucket_hour >= ? AND bucket_hour < ?`,
            [from, to, from, to],
        );

        return rows.map((row: Record<string, unknown>) => String(row.fsp));
    }

    private static scopeClause(scopeFspId: string | undefined): {clause: string; params: unknown[]} {
        if (scopeFspId == null) {
            return {clause: '', params: []};
        }

        return {clause: ' AND (payer_fsp = ? OR payee_fsp = ?)', params: [scopeFspId, scopeFspId]};
    }

    private static toIsoDate(value: unknown): string {
        if (value instanceof Date) {
            return value.toISOString().slice(0, 10);
        }

        return String(value).slice(0, 10);
    }
}

export namespace TransactionRollupRepository {

    export type RollupRow = {
        bucket_hour: string;
        payer_fsp: string;
        payee_fsp: string;
        currency: string;
        txn_count: number | string;
        error_count: number | string | null;
        dispute_count: number | string | null;
        parties_error_count: number | string | null;
        quotes_error_count: number | string | null;
        transfers_error_count: number | string | null;
        patch_error_count: number | string | null;
        committed_amount: number | string | null;
        committed_count: number | string | null;
        latency_count: number | string | null;
        sum_latency_ms: number | string | null;
    };

    export type Result = {
        bucketsWritten: number;
    };

    /** Pre-computed UTC range boundaries for the dashboard reads. */
    export type Ranges = {
        todayFrom: Date;    // start of the current UTC day
        sevenFrom: Date;    // start of the day 6 days before today (today + 6 prior = 7 days)
        thirtyFrom: Date;   // start of the day 29 days before today
        to: Date;           // exclusive upper bound (start of the next hour)
    };

    export type Totals = {
        today: number;
        last7d: number;
        last30d: number;
        disputesToday: number;
        errorsToday: number;
    };

    export type StateCount = {state: string; count: number};

    export type StageCount = {stage: string; count: number};

    export type CurrencyValue = {currency: string; totalAmount: string; txnCount: number};

    export type FspCount = {fspId: string; count: number};

    export type DailyCount = {date: string; count: number; errorCount: number; disputeCount: number};

    export type HourlyCount = {hour: number; count: number; errorCount: number};

    export type LatencyPoint = {date: string; avgLatencyMs: number | null};

    export type FspLeg = 'payer_fsp' | 'payee_fsp';

    /** Current flag state of one transaction, for the live writer to classify. */
    export type LiveClassificationRecord = {
        payerFsp: string;
        payeeFsp: string;
        startedAt: Date;
        updatedAt: Date;   // monotonic rank for the live writer's concurrency guard
        error: boolean;
        possibleDispute: boolean;
        partiesError: boolean;
        quotesError: boolean;
        transfersError: boolean;
        patchError: boolean;
        latencyMs: number | null;
    };

    /**
     * Authoritative per-scope "today" totals from the rollup. Field-compatible with
     * `LiveVector` so reconciliation can reseed the live counters directly.
     */
    export type LiveTotals = {
        txn: number;
        success: number;
        error: number;
        dispute: number;
        partiesError: number;
        quotesError: number;
        transfersError: number;
        patchError: number;
        latencyCount: number;
        sumLatencyMs: number;
    };
}

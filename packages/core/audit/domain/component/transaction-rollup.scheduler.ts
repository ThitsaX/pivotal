// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {TransactionRollupRepository} from '../repository/transaction-rollup.repository';
import {LiveStatsStore} from './live-stats.store';
import {RollupLock} from './rollup-lock';

/**
 * Periodically refreshes `transaction_hourly_rollup`. Runs in-process on a `setInterval`
 * (matching the codebase's periodic-refresh convention, e.g. the signing-keys cache) rather
 * than `@nestjs/schedule`, which is not a dependency.
 *
 * Multi-replica safety: `app-auditor` is horizontally scaled, so every replica's timer fires.
 * A {@link RollupLock} (Redis `SET NX`) ensures only one replica actually runs each tick; on
 * Redis failure the tick fails closed and the next one retries — safe because re-aggregation is
 * idempotent (it recomputes and overwrites a bounded trailing window).
 *
 * Time parameters:
 *  - **interval** (`intervalMs`) — operational freshness knob; how often the job runs. Safe to
 *    tune via env.
 *  - **window** ({@link WINDOW_MS}) — how far back each run recomputes. NOT configurable: a
 *    transfer started late in one hour can settle in the next, so the previous hour's bucket
 *    must be revisited. Too small → silently stale/wrong statistics. Hence it is fixed in code.
 */
export class TransactionRollupScheduler implements OnModuleInit, OnModuleDestroy {

    private static readonly DEFAULT_INTERVAL_MS = 5 * 60 * 1000;       // 5 minutes
    private static readonly MS_PER_HOUR = 60 * 60 * 1000;
    private static readonly MS_PER_DAY = 24 * TransactionRollupScheduler.MS_PER_HOUR;
    private static readonly LOCK_TTL_BUFFER_MS = 10_000;

    /**
     * History to (re)build when the rollup is found empty (fresh deploy, or after a schema
     * migration that recreates the table). Matches the dashboard's 30-day read window — anything
     * older is never queried. The incremental {@link WINDOW_MS} only fills *forward*, so without
     * this one-time backfill a freshly created rollup would silently miss all pre-existing
     * history (the 30-day trend would be empty and "today" would omit hours older than the window).
     */
    private static readonly BACKFILL_DAYS = 30;
    private static readonly BACKFILL_LOCK_TTL_MS = 5 * 60 * 1000;

    /**
     * Fixed 3-hour trailing window (current hour + 2 prior). Covers a transfer that started
     * late in one hour and settles minutes into the next, plus margin for a missed tick (Redis
     * outage) and read-replica lag. Intentionally a constant — see class docs.
     */
    private static readonly WINDOW_MS = 3 * TransactionRollupScheduler.MS_PER_HOUR;

    private readonly logger = new Logger(TransactionRollupScheduler.name);
    private timer: NodeJS.Timeout | undefined;
    private running = false;

    constructor(
        private readonly repository: TransactionRollupRepository,
        private readonly lock: RollupLock,
        private readonly intervalMs: number = TransactionRollupScheduler.DEFAULT_INTERVAL_MS,
        private readonly liveStats?: LiveStatsStore,
    ) {
        // A bucket must be re-aggregated at least once after it has settled while still inside
        // the trailing window. If the interval were as long as (or longer than) the window minus
        // an hour, a bucket could age out before its final recompute → wrong stats. Fail loud at
        // boot rather than silently corrupt the dashboard.
        const maxIntervalMs = TransactionRollupScheduler.WINDOW_MS - TransactionRollupScheduler.MS_PER_HOUR;
        if (intervalMs > maxIntervalMs) {
            throw new Error(
                `TRANSACTION_ROLLUP_INTERVAL_SECONDS too large: interval (${intervalMs}ms) must be ` +
                `<= ${maxIntervalMs}ms (rollup window ${TransactionRollupScheduler.WINDOW_MS}ms minus one hour), ` +
                `otherwise hourly buckets could age out of the window before their final recompute.`,
            );
        }
    }

    onModuleInit(): void {
        void this.bootstrap();
    }

    /**
     * One-time startup sequence: backfill the retention window if the rollup is empty, THEN settle
     * into the periodic incremental cadence. Backfill must precede the first tick so the empty
     * check isn't defeated by the tick having just written the trailing window.
     */
    private async bootstrap(): Promise<void> {
        try {
            await this.backfillIfEmpty();
        } catch (error) {
            this.logger.error(
                `Rollup backfill failed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error.stack : undefined,
            );
        }

        // Fire once so a freshly (re)started pod doesn't wait a full interval for the first
        // refresh, then settle into the periodic cadence.
        void this.tick();
        this.timer = setInterval(() => void this.tick(), this.intervalMs);

        // Don't let the timer keep the event loop alive on shutdown.
        this.timer.unref?.();
        this.logger.log(
            `Rollup scheduler started (every ${this.intervalMs}ms, window ${TransactionRollupScheduler.WINDOW_MS}ms).`,
        );
    }

    /**
     * Backfills {@link BACKFILL_DAYS} of history, day by day, but only when the rollup is empty —
     * i.e. a fresh table (first deploy) or one just recreated by a migration. A populated rollup is
     * kept current by the incremental ticks, so this no-ops on a normal restart. Lock-guarded so
     * only one replica backfills; idempotent (replace-window) so a lock timeout that lets two run
     * is harmless. Chunked per day to keep each write transaction bounded on large datasets.
     */
    private async backfillIfEmpty(): Promise<void> {
        const token = await this.lock.acquire(TransactionRollupScheduler.BACKFILL_LOCK_TTL_MS);

        if (token === null) {
            this.logger.debug('Backfill skipped: lock held by another replica or Redis unavailable.');
            return;
        }

        try {
            if (await this.repository.getLastUpdatedAt() !== null) {
                this.logger.debug('Rollup already populated; backfill not needed.');
                return;
            }

            this.logger.log(`Empty rollup detected; backfilling ${TransactionRollupScheduler.BACKFILL_DAYS} days.`);

            const todayStartMs =
                Math.floor(Date.now() / TransactionRollupScheduler.MS_PER_DAY) *
                TransactionRollupScheduler.MS_PER_DAY;
            let buckets = 0;

            for (let day = TransactionRollupScheduler.BACKFILL_DAYS - 1; day >= 0; day--) {
                const dayStart = new Date(todayStartMs - day * TransactionRollupScheduler.MS_PER_DAY);
                const dayEnd = new Date(todayStartMs - (day - 1) * TransactionRollupScheduler.MS_PER_DAY);
                const result = await this.repository.reaggregateWindow(dayStart, dayEnd);
                buckets += result.bucketsWritten;
            }

            this.logger.log(
                `Backfill complete: ${buckets} buckets across ${TransactionRollupScheduler.BACKFILL_DAYS} days.`,
            );

            // Seed today's live counters from the freshly backfilled rollup so the live tier
            // starts consistent rather than from zero.
            await this.reconcileLive(new Date());
        } finally {
            await this.lock.release(token);
        }
    }

    /**
     * Overwrites the near-real-time ("live") counters for the current UTC day from the
     * authoritative rollup — the reconciliation that heals any drift accumulated by the
     * per-event {@link LiveStatsWriter} (missed/late/duplicate events). Recomputes the hub
     * scope plus every FSP active today, mirroring the dashboard's scoping exactly. Runs only
     * on the lock-holding replica (invoked from {@link tick}/{@link backfillIfEmpty}) and is
     * best-effort — a failure never disrupts the rollup refresh.
     */
    private async reconcileLive(now: Date): Promise<void> {
        if (this.liveStats === undefined) {
            return;
        }

        try {
            const todayStartMs =
                Math.floor(now.getTime() / TransactionRollupScheduler.MS_PER_DAY) *
                TransactionRollupScheduler.MS_PER_DAY;
            const toMs =
                Math.floor(now.getTime() / TransactionRollupScheduler.MS_PER_HOUR) *
                TransactionRollupScheduler.MS_PER_HOUR +
                TransactionRollupScheduler.MS_PER_HOUR;
            const todayStart = new Date(todayStartMs);
            const to = new Date(toMs);
            const dateKey = LiveStatsStore.dateKey(todayStart);

            const hubTotals = await this.repository.getLiveTotals(undefined, todayStart, to);
            await this.liveStats.reseedScope(dateKey, LiveStatsStore.hubScope(), hubTotals);

            const fsps = await this.repository.getActiveFsps(todayStart, to);
            for (const fsp of fsps) {
                const totals = await this.repository.getLiveTotals(fsp, todayStart, to);
                await this.liveStats.reseedScope(dateKey, LiveStatsStore.fspScope(fsp), totals);
            }

            this.logger.debug(`Live counters reconciled for ${dateKey} (hub + ${fsps.length} FSP scopes).`);
        } catch (error) {
            this.logger.error(
                `Live reconcile failed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error.stack : undefined,
            );
        }
    }

    onModuleDestroy(): void {
        if (this.timer !== undefined) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /**
     * One scheduled cycle. Fully guarded: a failure here must never escape (it would be an
     * unhandled rejection in the interval callback). Skips if a prior tick on this replica is
     * still running, or if another replica holds the lock.
     */
    private async tick(): Promise<void> {
        if (this.running) {
            this.logger.debug('Previous rollup tick still running; skipping.');
            return;
        }

        this.running = true;

        const lockTtlMs = Math.max(this.intervalMs - TransactionRollupScheduler.LOCK_TTL_BUFFER_MS, 1_000);
        let token: string | null = null;

        try {
            token = await this.lock.acquire(lockTtlMs);

            if (token === null) {
                // Another replica is handling this tick, or Redis is down (fail-closed).
                this.logger.debug('Rollup lock not acquired; another replica or Redis unavailable.');
                return;
            }

            const {windowStart, windowEnd} = TransactionRollupScheduler.computeWindow(new Date());
            const result = await this.repository.reaggregateWindow(windowStart, windowEnd);

            this.logger.debug(
                `Rollup refreshed ${result.bucketsWritten} buckets for ` +
                `[${windowStart.toISOString()}, ${windowEnd.toISOString()}).`,
            );

            // Reseed the near-real-time counters from the just-rebuilt rollup (authoritative
            // backstop for the per-event live writers). Lock is held here, so this runs on one
            // replica only.
            await this.reconcileLive(new Date());
        } catch (error) {
            this.logger.error(
                `Rollup tick failed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error.stack : undefined,
            );
        } finally {
            if (token !== null) {
                await this.lock.release(token);
            }
            this.running = false;
        }
    }

    /**
     * Trailing window aligned to UTC hour boundaries. Epoch-ms flooring yields UTC hour starts
     * directly (epoch 0 is 00:00:00 UTC and 3_600_000ms == 1h), so no timezone math is needed.
     *   windowEnd   = start of the next hour (exclusive) — includes the current, still-open hour
     *   windowStart = windowEnd - WINDOW_MS                — the fixed bounded trailing span
     */
    private static computeWindow(now: Date): {windowStart: Date; windowEnd: Date} {
        const currentHourStartMs =
            Math.floor(now.getTime() / TransactionRollupScheduler.MS_PER_HOUR) *
            TransactionRollupScheduler.MS_PER_HOUR;
        const windowEnd = new Date(currentHourStartMs + TransactionRollupScheduler.MS_PER_HOUR);
        const windowStart = new Date(windowEnd.getTime() - TransactionRollupScheduler.WINDOW_MS);

        return {windowStart, windowEnd};
    }
}

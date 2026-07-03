// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Logger} from '@nestjs/common';
import {TransactionRollupRepository} from '../repository/transaction-rollup.repository';
import {classify, LiveVector} from './live-stats.classifier';
import {LiveStatsStore} from './live-stats.store';

/**
 * Updates the near-real-time ("live") dashboard counters as audit events stream in. Invoked
 * once per audit event by {@link AuditTransactionConsumer}, AFTER the event has been persisted,
 * so it always classifies the transaction's *current, merged* flag state.
 *
 * Per-transaction (not per-event) counting: each call re-reads the row, classifies it into a
 * {@link LiveVector}, and applies only the DIFFERENCE from the last vector counted for that
 * `correlation_id` (held in a short-TTL Redis marker). Consequences:
 *   - `txn` increments exactly once (first event: marker absent ⇒ delta from zero).
 *   - A late patch failure (COMMITTED → dispute) is a single transition delta
 *     `success -1, error +1, dispute +1` — no special-casing.
 *   - Re-reading the merged DB row makes out-of-order events harmless (we always see latest
 *     truth); the marker only prevents re-counting.
 *
 * Each transaction contributes to up to three scopes — hub, payer FSP, payee FSP (deduped when
 * payer == payee) — matching the dashboard's `(payer OR payee)` scoping.
 *
 * Strictly best-effort: this must NEVER throw into the consume loop (a stats failure must not
 * nak/redeliver an audit message). Any miscount is healed by the 5-minute reconciliation.
 */
export class LiveStatsWriter {

    private readonly logger = new Logger(LiveStatsWriter.name);

    constructor(
        private readonly repository: TransactionRollupRepository,
        private readonly store: LiveStatsStore,
    ) {
    }

    async onTransactionEvent(correlationId: string): Promise<void> {
        try {
            const record = await this.repository.findLiveClassification(correlationId);

            if (record == null) {
                // Row not visible yet on the read replica (replica lag). Reconciliation will
                // pick it up; skip rather than guess.
                return;
            }

            const next = classify({
                error: record.error,
                possibleDispute: record.possibleDispute,
                partiesError: record.partiesError,
                quotesError: record.quotesError,
                transfersError: record.transfersError,
                patchError: record.patchError,
                latencyMs: record.latencyMs,
            });

            // Atomic compare-and-apply against the per-transaction marker, ranked by the row's
            // updated_at, so concurrent writers across replicas can't double-count or regress.
            await this.store.applyEvent(
                correlationId,
                LiveStatsStore.dateKey(record.startedAt),
                LiveStatsWriter.scopesFor(record.payerFsp, record.payeeFsp),
                next,
                record.updatedAt.getTime(),
            );
        } catch (error) {
            // Best-effort: swallow so the audit pipeline is never disrupted.
            this.logger.debug(
                `Live-stats update skipped for ${correlationId}: ` +
                `${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /** Hub plus each distinct FSP leg (deduped when payer == payee, e.g. intra-FSP). */
    private static scopesFor(payerFsp: string, payeeFsp: string): string[] {
        const scopes = [LiveStatsStore.hubScope(), LiveStatsStore.fspScope(payerFsp)];

        if (payeeFsp !== payerFsp) {
            scopes.push(LiveStatsStore.fspScope(payeeFsp));
        }

        return scopes;
    }
}

// Keep the LiveVector type re-exported here for ergonomic imports by callers/tests.
export type {LiveVector};

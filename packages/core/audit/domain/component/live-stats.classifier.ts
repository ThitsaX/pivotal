/**
 * Pure classification + delta logic for the near-real-time ("live") dashboard tier.
 *
 * A transaction is represented by ONE row keyed on `correlation_id` that mutates as the
 * FSPIOP flow progresses (parties → quotes → transfers → patch). The live tier therefore
 * counts **per transaction, not per event**: each audit event re-reads the row's current
 * flags, derives a {@link LiveVector}, and applies only the DIFFERENCE from the last vector
 * it counted for that transaction. This makes late reclassifications — most importantly a
 * COMMITTED transfer turning into a dispute when the patch call fails — fall out naturally
 * as a single transition delta (`success -1, error +1, dispute +1`) rather than a special
 * case.
 *
 * Outcome is derived from the `error` flag, exactly like the hourly rollup, so the 5-minute
 * reconciliation can overwrite these counters from authoritative data with no definitional
 * drift:
 *   - success  ⇔ error = 0
 *   - error    ⇔ error = 1
 *   - dispute  ⇔ possible_dispute = 1  (also an error; `transfer_state` stays COMMITTED)
 *
 * v1 intentionally tracks only the headline KPI measures (counts + latency). Per-currency
 * "value moved" stays on the 5-minute rollup snapshot — it is monotonic (only ever lags,
 * never wrong) and keeping it out avoids dynamic per-currency fields and float-money sums in
 * Redis. It can be added later without changing this shape.
 */
export type LiveVector = {
    txn: number;            // 1 once the transaction row exists
    success: number;        // error = 0
    error: number;          // error = 1
    dispute: number;        // possible_dispute = 1
    partiesError: number;   // stage attribution (exactly one set on an errored txn)
    quotesError: number;
    transfersError: number;
    patchError: number;
    latencyCount: number;   // 1 once transaction_completed_at is set
    sumLatencyMs: number;   // latency in ms (0 until completed)
};

/** The flag/measure columns the classifier needs, read fresh from `transactions`. */
export type LiveClassificationRow = {
    error: boolean;
    possibleDispute: boolean;
    partiesError: boolean;
    quotesError: boolean;
    transfersError: boolean;
    patchError: boolean;
    latencyMs: number | null;   // null until the transaction completes
};

export const LIVE_VECTOR_ZERO: Readonly<LiveVector> = Object.freeze({
    txn: 0, success: 0, error: 0, dispute: 0,
    partiesError: 0, quotesError: 0, transfersError: 0, patchError: 0,
    latencyCount: 0, sumLatencyMs: 0,
});

/** The Redis hash field name for each vector measure (kept short; stable across versions). */
export const LIVE_FIELD: Readonly<Record<keyof LiveVector, string>> = Object.freeze({
    txn: 'txn',
    success: 'ok',
    error: 'err',
    dispute: 'disp',
    partiesError: 'e_parties',
    quotesError: 'e_quotes',
    transfersError: 'e_transfers',
    patchError: 'e_patch',
    latencyCount: 'lat_cnt',
    sumLatencyMs: 'lat_sum',
});

export const LIVE_FIELDS = Object.keys(LIVE_FIELD) as Array<keyof LiveVector>;

/** Maps a transaction's current flags to its contribution vector. */
export function classify(row: LiveClassificationRow): LiveVector {
    return {
        txn: 1,
        success: row.error ? 0 : 1,
        error: row.error ? 1 : 0,
        dispute: row.possibleDispute ? 1 : 0,
        partiesError: row.partiesError ? 1 : 0,
        quotesError: row.quotesError ? 1 : 0,
        transfersError: row.transfersError ? 1 : 0,
        patchError: row.patchError ? 1 : 0,
        latencyCount: row.latencyMs == null ? 0 : 1,
        sumLatencyMs: row.latencyMs ?? 0,
    };
}

/** Element-wise `next − previous`. Zero when nothing changed (idempotent re-processing). */
export function diff(previous: LiveVector, next: LiveVector): LiveVector {
    return {
        txn: next.txn - previous.txn,
        success: next.success - previous.success,
        error: next.error - previous.error,
        dispute: next.dispute - previous.dispute,
        partiesError: next.partiesError - previous.partiesError,
        quotesError: next.quotesError - previous.quotesError,
        transfersError: next.transfersError - previous.transfersError,
        patchError: next.patchError - previous.patchError,
        latencyCount: next.latencyCount - previous.latencyCount,
        sumLatencyMs: next.sumLatencyMs - previous.sumLatencyMs,
    };
}

/** True when every measure is zero — nothing to write. */
export function isZero(vector: LiveVector): boolean {
    return LIVE_FIELDS.every((field) => vector[field] === 0);
}

/** Headline KPIs derived from a counter vector — the shape the live dashboard endpoint returns. */
export type LiveKpi = {
    today: number;
    successRateToday: number | null;
    errorsToday: number;
    disputesToday: number;
    avgLatencyMsToday: number | null;
};

/** Derives rates/averages at read time (rates are never stored), mirroring the rollup handler. */
export function toLiveKpi(vector: LiveVector): LiveKpi {
    return {
        today: vector.txn,
        successRateToday: vector.txn > 0 ? vector.success / vector.txn : null,
        errorsToday: vector.error,
        disputesToday: vector.dispute,
        avgLatencyMsToday: vector.latencyCount > 0 ? vector.sumLatencyMs / vector.latencyCount : null,
    };
}

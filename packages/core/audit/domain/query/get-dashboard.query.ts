// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class GetDashboardQuery {
    constructor(public readonly input: GetDashboardQuery.Input) {
    }
}

export namespace GetDashboardQuery {

    export class Input {
        constructor(
            public readonly accessScope?: AccessScope,
        ) {
        }
    }

    /** Present for DFSP-scoped callers; absent for HUB callers (who see all FSPs). */
    export class AccessScope {
        constructor(
            public readonly fspId: string,
        ) {
        }
    }

    export type Totals = {
        today: number;
        last7d: number;
        last30d: number;
    };

    export type StateCount = {state: string; count: number};

    export type StageCount = {stage: string; count: number};

    export type CurrencyValue = {currency: string; totalAmount: string; txnCount: number};

    export type FspCount = {fspId: string; count: number};

    export type DailyCount = {date: string; count: number; errorCount: number; disputeCount: number};

    export type HourlyCount = {hour: number; count: number; errorCount: number};

    export type LatencyPoint = {date: string; avgLatencyMs: number | null};

    /**
     * Consolidated dashboard payload, assembled from the hourly rollup in one query pass.
     * All "today" figures use the current UTC day; trend spans the last 30 days.
     */
    export class Output {
        constructor(
            public readonly asOf: string | null,            // rollup freshness (ISO), null if never run
            public readonly generatedAt: string,            // response time (ISO)
            public readonly totals: Totals,                 // transaction counts
            public readonly errorsToday: number,
            public readonly disputesToday: number,
            public readonly successRateToday: number | null, // COMMITTED / total today (0..1), null if no data
            public readonly byState: StateCount[],          // today, outcome: COMMITTED vs ERROR (from error flag)
            public readonly errorByStage: StageCount[],     // today, errors attributed by failed stage
            public readonly valueByCurrency: CurrencyValue[], // today, per currency
            public readonly topPayerFsps: FspCount[],       // today
            public readonly topPayeeFsps: FspCount[],       // today
            public readonly avgLatencyMsToday: number | null,
            public readonly dailyTrend: DailyCount[],       // last 30 days (count + error/dispute split)
            public readonly hourlyToday: HourlyCount[],     // today, padded 0..23 UTC hours
            public readonly latencyTrend: LatencyPoint[],   // last 30 days, avg latency per day
        ) {
        }
    }
}

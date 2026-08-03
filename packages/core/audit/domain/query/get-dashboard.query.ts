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
            public readonly range?: DateRange,
            public readonly timeZone: string = 'UTC',
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

    export class DateRange {
        constructor(
            public readonly from: Date,
            public readonly to: Date,
        ) {
        }
    }

    export type AppliedRange = {
        from: string;
        to: string;
        timeZone: string;
    };

    export type StateCount = {state: string; count: number};

    export type StageCount = {stage: string; count: number};

    export type CurrencyValue = {
        currency: string;
        useCase: string;
        totalAmount: string;
        txnCount: number;
    };

    export type FspCount = {fspId: string; count: number};

    export type DailyCount = {date: string; count: number; errorCount: number; disputeCount: number};

    export type HourlyCount = {hour: number; count: number; errorCount: number};

    export type LatencyPoint = {date: string; avgLatencyMs: number | null};

    /**
     * Consolidated dashboard payload assembled from the hourly rollup for the selected range.
     */
    export class Output {
        constructor(
            public readonly asOf: string | null,            // rollup freshness (ISO), null if never run
            public readonly generatedAt: string,            // response time (ISO)
            public readonly range: AppliedRange,
            public readonly total: number,
            public readonly errors: number,
            public readonly disputes: number,
            public readonly successRate: number | null,
            public readonly byState: StateCount[],
            public readonly errorByStage: StageCount[],
            public readonly valueByCurrency: CurrencyValue[],
            public readonly topPayerFsps: FspCount[],
            public readonly topPayeeFsps: FspCount[],
            public readonly avgLatencyMs: number | null,
            public readonly dailyTrend: DailyCount[],
            public readonly hourlyProfile: HourlyCount[],
            public readonly latencyTrend: LatencyPoint[],
        ) {
        }
    }
}

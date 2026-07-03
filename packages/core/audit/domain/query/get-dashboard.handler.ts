// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {TransactionRollupRepository} from '../repository';
import {GetDashboardQuery} from './get-dashboard.query';

@QueryHandler(GetDashboardQuery)
export class GetDashboardHandler
    implements IQueryHandler<GetDashboardQuery, GetDashboardQuery.Output> {

    private static readonly MS_PER_HOUR = 60 * 60 * 1000;
    private static readonly MS_PER_DAY = 24 * GetDashboardHandler.MS_PER_HOUR;
    private static readonly TOP_FSP_LIMIT = 5;
    private static readonly TREND_DAYS = 30;

    constructor(
        @Inject(TransactionRollupRepository)
        private readonly repository: TransactionRollupRepository,
    ) {
    }

    async execute(query: GetDashboardQuery): Promise<GetDashboardQuery.Output> {
        const scopeFspId = query.input.accessScope?.fspId;
        const now = new Date();
        const ranges = GetDashboardHandler.computeRanges(now);
        const {todayFrom, thirtyFrom, to} = ranges;
        const dayKeys = GetDashboardHandler.dayKeys(thirtyFrom);

        // All reads hit the tiny rollup table and are independent → run them concurrently.
        const [
            totals,
            errorByStage,
            valueByCurrency,
            topPayerFsps,
            topPayeeFsps,
            avgLatencyMsToday,
            dailyTrend,
            hourlyToday,
            latencyTrend,
            lastUpdatedAt,
        ] = await Promise.all([
            this.repository.getTotals(scopeFspId, ranges),
            this.repository.getErrorStageBreakdown(scopeFspId, todayFrom, to),
            this.repository.getValueByCurrency(scopeFspId, todayFrom, to),
            this.repository.getTopFsps(scopeFspId, 'payer_fsp', todayFrom, to, GetDashboardHandler.TOP_FSP_LIMIT),
            this.repository.getTopFsps(scopeFspId, 'payee_fsp', todayFrom, to, GetDashboardHandler.TOP_FSP_LIMIT),
            this.repository.getAvgLatencyMs(scopeFspId, todayFrom, to),
            this.repository.getDailyTrend(scopeFspId, thirtyFrom, to),
            this.repository.getHourlyToday(scopeFspId, todayFrom, to),
            this.repository.getDailyLatency(scopeFspId, thirtyFrom, to),
            this.repository.getLastUpdatedAt(),
        ]);

        // Outcome is binary on the `error` flag: COMMITTED (error = 0) vs ERROR (error = 1).
        const committedToday = Math.max(totals.today - totals.errorsToday, 0);
        const byState = GetDashboardHandler.outcomeBreakdown(committedToday, totals.errorsToday);
        const successRateToday = totals.today === 0 ? null : committedToday / totals.today;

        return new GetDashboardQuery.Output(
            lastUpdatedAt == null ? null : lastUpdatedAt.toISOString(),
            now.toISOString(),
            {today: totals.today, last7d: totals.last7d, last30d: totals.last30d},
            totals.errorsToday,
            totals.disputesToday,
            successRateToday,
            byState,
            errorByStage,
            valueByCurrency,
            topPayerFsps,
            topPayeeFsps,
            avgLatencyMsToday,
            GetDashboardHandler.padDaily(dailyTrend, dayKeys),
            GetDashboardHandler.padHours(hourlyToday),
            GetDashboardHandler.padLatency(latencyTrend, dayKeys),
        );
    }

    /** Today's committed-vs-error split for the outcome donut; empty slices are omitted. */
    private static outcomeBreakdown(committed: number, errors: number): GetDashboardQuery.StateCount[] {
        const entries: GetDashboardQuery.StateCount[] = [];

        if (committed > 0) {
            entries.push({state: 'COMMITTED', count: committed});
        }

        if (errors > 0) {
            entries.push({state: 'ERROR', count: errors});
        }

        return entries;
    }

    /** Pads the sparse hourly result to a full 0..23 UTC axis so the intraday chart has no gaps. */
    private static padHours(
        hourly: GetDashboardQuery.HourlyCount[],
    ): GetDashboardQuery.HourlyCount[] {
        const byHour = new Map(hourly.map((entry) => [entry.hour, entry]));

        return Array.from({length: 24}, (_unused, hour) =>
            byHour.get(hour) ?? {hour, count: 0, errorCount: 0});
    }

    /** The full set of UTC `YYYY-MM-DD` keys covered by the 30-day window, oldest first. */
    private static dayKeys(thirtyFrom: Date): string[] {
        const fromMs = thirtyFrom.getTime();

        return Array.from({length: GetDashboardHandler.TREND_DAYS}, (_unused, i) =>
            new Date(fromMs + i * GetDashboardHandler.MS_PER_DAY).toISOString().slice(0, 10));
    }

    /** Fills missing days with zero counts so the trend chart spans a continuous 30-day axis. */
    private static padDaily(
        rows: GetDashboardQuery.DailyCount[],
        keys: string[],
    ): GetDashboardQuery.DailyCount[] {
        const byDate = new Map(rows.map((row) => [row.date, row]));

        return keys.map((date) => byDate.get(date) ?? {date, count: 0, errorCount: 0, disputeCount: 0});
    }

    /** Fills missing days with a null latency (rendered as a line gap) over the 30-day axis. */
    private static padLatency(
        rows: GetDashboardQuery.LatencyPoint[],
        keys: string[],
    ): GetDashboardQuery.LatencyPoint[] {
        const byDate = new Map(rows.map((row) => [row.date, row]));

        return keys.map((date) => byDate.get(date) ?? {date, avgLatencyMs: null});
    }

    /**
     * UTC range boundaries. `to` is the start of the next hour (exclusive) so today's open hour
     * is included; "today" starts at 00:00 UTC; 7d/30d are inclusive of today (today + N-1 prior).
     */
    private static computeRanges(now: Date): TransactionRollupRepository.Ranges {
        const todayFromMs =
            Math.floor(now.getTime() / GetDashboardHandler.MS_PER_DAY) * GetDashboardHandler.MS_PER_DAY;
        const toMs =
            Math.floor(now.getTime() / GetDashboardHandler.MS_PER_HOUR) * GetDashboardHandler.MS_PER_HOUR +
            GetDashboardHandler.MS_PER_HOUR;

        return {
            todayFrom: new Date(todayFromMs),
            sevenFrom: new Date(todayFromMs - 6 * GetDashboardHandler.MS_PER_DAY),
            thirtyFrom: new Date(todayFromMs - 29 * GetDashboardHandler.MS_PER_DAY),
            to: new Date(toMs),
        };
    }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
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

    constructor(
        @Inject(TransactionRollupRepository)
        private readonly repository: TransactionRollupRepository,
    ) {
    }

    async execute(query: GetDashboardQuery): Promise<GetDashboardQuery.Output> {
        const scopeFspId = query.input.accessScope?.fspId;
        const now = new Date();
        const range = query.input.range ?? GetDashboardHandler.currentUtcDay(now);
        const timeZone = query.input.timeZone;

        const [
            errorByStage,
            valueByCurrency,
            topPayerFsps,
            topPayeeFsps,
            timeBuckets,
            lastUpdatedAt,
        ] = await Promise.all([
            this.repository.getErrorStageBreakdown(scopeFspId, range.from, range.to),
            this.repository.getValueByCurrency(scopeFspId, range.from, range.to),
            this.repository.getTopFsps(scopeFspId, 'payer_fsp', range.from, range.to, GetDashboardHandler.TOP_FSP_LIMIT),
            this.repository.getTopFsps(scopeFspId, 'payee_fsp', range.from, range.to, GetDashboardHandler.TOP_FSP_LIMIT),
            this.repository.getTimeBuckets(scopeFspId, range.from, range.to),
            this.repository.getLastUpdatedAt(),
        ]);

        const summary = GetDashboardHandler.summarize(timeBuckets);
        const committed = Math.max(summary.total - summary.errors, 0);
        const dayKeys = GetDashboardHandler.dayKeys(range, timeZone);

        return new GetDashboardQuery.Output(
            lastUpdatedAt == null ? null : lastUpdatedAt.toISOString(),
            now.toISOString(),
            {from: range.from.toISOString(), to: range.to.toISOString(), timeZone},
            summary.total,
            summary.errors,
            summary.disputes,
            summary.total === 0 ? null : committed / summary.total,
            GetDashboardHandler.outcomeBreakdown(committed, summary.errors),
            errorByStage,
            valueByCurrency,
            topPayerFsps,
            topPayeeFsps,
            summary.latencyCount === 0 ? null : summary.sumLatencyMs / summary.latencyCount,
            GetDashboardHandler.dailyTrend(timeBuckets, dayKeys, timeZone),
            GetDashboardHandler.hourlyProfile(timeBuckets, timeZone),
            GetDashboardHandler.latencyTrend(timeBuckets, dayKeys, timeZone),
        );
    }

    private static summarize(buckets: TransactionRollupRepository.TimeBucket[]): {
        total: number;
        errors: number;
        disputes: number;
        sumLatencyMs: number;
        latencyCount: number;
    } {
        return buckets.reduce((summary, bucket) => ({
            total: summary.total + bucket.count,
            errors: summary.errors + bucket.errorCount,
            disputes: summary.disputes + bucket.disputeCount,
            sumLatencyMs: summary.sumLatencyMs + (bucket.sumLatencyMs ?? 0),
            latencyCount: summary.latencyCount + bucket.latencyCount,
        }), {total: 0, errors: 0, disputes: 0, sumLatencyMs: 0, latencyCount: 0});
    }

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

    private static dailyTrend(
        buckets: TransactionRollupRepository.TimeBucket[],
        dayKeys: string[],
        timeZone: string,
    ): GetDashboardQuery.DailyCount[] {
        const byDate = new Map(dayKeys.map((date) => [date, {
            date,
            count: 0,
            errorCount: 0,
            disputeCount: 0,
        }]));

        for (const bucket of buckets) {
            const date = GetDashboardHandler.localParts(new Date(bucket.bucketHour), timeZone).date;
            const entry = byDate.get(date) ?? {date, count: 0, errorCount: 0, disputeCount: 0};
            entry.count += bucket.count;
            entry.errorCount += bucket.errorCount;
            entry.disputeCount += bucket.disputeCount;
            byDate.set(date, entry);
        }

        return [...byDate.values()];
    }

    private static hourlyProfile(
        buckets: TransactionRollupRepository.TimeBucket[],
        timeZone: string,
    ): GetDashboardQuery.HourlyCount[] {
        const hours = Array.from({length: 24}, (_unused, hour) => ({hour, count: 0, errorCount: 0}));

        for (const bucket of buckets) {
            const hour = GetDashboardHandler.localParts(new Date(bucket.bucketHour), timeZone).hour;
            hours[hour].count += bucket.count;
            hours[hour].errorCount += bucket.errorCount;
        }

        return hours;
    }

    private static latencyTrend(
        buckets: TransactionRollupRepository.TimeBucket[],
        dayKeys: string[],
        timeZone: string,
    ): GetDashboardQuery.LatencyPoint[] {
        const byDate = new Map(dayKeys.map((date) => [date, {sum: 0, count: 0}]));

        for (const bucket of buckets) {
            const date = GetDashboardHandler.localParts(new Date(bucket.bucketHour), timeZone).date;
            const entry = byDate.get(date) ?? {sum: 0, count: 0};
            entry.sum += bucket.sumLatencyMs ?? 0;
            entry.count += bucket.latencyCount;
            byDate.set(date, entry);
        }

        return [...byDate].map(([date, value]) => ({
            date,
            avgLatencyMs: value.count === 0 ? null : value.sum / value.count,
        }));
    }

    private static dayKeys(range: GetDashboardQuery.DateRange, timeZone: string): string[] {
        const keys = new Set<string>();
        const start = Math.floor(range.from.getTime() / GetDashboardHandler.MS_PER_HOUR)
            * GetDashboardHandler.MS_PER_HOUR;

        for (let cursor = start; cursor < range.to.getTime(); cursor += GetDashboardHandler.MS_PER_HOUR) {
            keys.add(GetDashboardHandler.localParts(new Date(cursor), timeZone).date);
        }

        return [...keys];
    }

    private static localParts(date: Date, timeZone: string): {date: string; hour: number} {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(date);
        const value = (type: Intl.DateTimeFormatPartTypes): string =>
            parts.find((part) => part.type === type)?.value ?? '';

        return {
            date: `${value('year')}-${value('month')}-${value('day')}`,
            hour: Number(value('hour')),
        };
    }

    private static currentUtcDay(now: Date): GetDashboardQuery.DateRange {
        const fromMs = Math.floor(now.getTime() / GetDashboardHandler.MS_PER_DAY)
            * GetDashboardHandler.MS_PER_DAY;

        return new GetDashboardQuery.DateRange(new Date(fromMs), new Date(fromMs + GetDashboardHandler.MS_PER_DAY));
    }
}

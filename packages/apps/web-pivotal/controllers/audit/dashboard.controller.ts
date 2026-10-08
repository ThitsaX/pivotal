// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {BadRequestException, Controller, Get, Inject, Query} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {AccessTokenClaims, PermissionKey, RequiresPermission} from '@core/auth/domain';
import {GetDashboardQuery, LiveStatsStore, toLiveKpi} from '@core/audit/domain';
import {AuthUser} from '../../decorators';
import {QueryParamsUtil} from '../query-params.util';

/** Near-real-time KPI snapshot for the dashboard's headline tiles (polled by the portal). */
export type LiveStatsDto = {
    asOf: string;                         // server time (live counters are always "now")
    scope: string;                        // 'hub' or the caller's fspId (for display)
    today: number;
    successRateToday: number | null;
    errorsToday: number;
    disputesToday: number;
    avgLatencyMsToday: number | null;
};

@Controller('audit/dashboard')
export class DashboardAuditController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
        @Inject(LiveStatsStore)
        private readonly liveStats: LiveStatsStore,
    ) {
    }

    @Get()
    @RequiresPermission(PermissionKey.AUDIT_DASHBOARD_VIEW)
    async getDashboard(
        @AuthUser() claims: AccessTokenClaims | undefined,
        @Query('from') fromValue?: string,
        @Query('to') toValue?: string,
        @Query('timeZone') timeZoneValue?: string,
        @Query('payerFsp') payerFspValue?: string,
        @Query('payeeFsp') payeeFspValue?: string,
    ): Promise<GetDashboardQuery.Output> {
        const accessScope = DashboardAuditController.resolveAccessScope(claims);
        const timeZone = DashboardAuditController.parseTimeZone(timeZoneValue);
        const range = DashboardAuditController.parseRange(fromValue, toValue, timeZone);
        const payerFsp = QueryParamsUtil.toOptionalString(payerFspValue);
        const payeeFsp = QueryParamsUtil.toOptionalString(payeeFspValue);

        return this.queryBus.execute(
            new GetDashboardQuery(new GetDashboardQuery.Input(accessScope, range, timeZone, payerFsp, payeeFsp)),
        );
    }

    /**
     * Near-real-time headline KPIs from the live Redis counters, scoped from the JWT exactly
     * like {@link getDashboard} (HUB sees all; a DFSP sees its own `(payer OR payee)` slice).
     * Cheap O(fields) Redis read — meant to be polled every few seconds. Falls back to zeros if
     * the counters are unavailable (the portal keeps showing the rollup snapshot in that case).
     */
    @Get('live')
    @RequiresPermission(PermissionKey.AUDIT_DASHBOARD_VIEW)
    async getLive(
        @AuthUser() claims: AccessTokenClaims | undefined,
    ): Promise<LiveStatsDto> {
        const fspId = claims?.fspId ?? null;
        const scope = fspId == null ? LiveStatsStore.hubScope() : LiveStatsStore.fspScope(fspId);
        const vector = await this.liveStats.readScope(LiveStatsStore.dateKey(new Date()), scope);

        return {
            asOf: new Date().toISOString(),
            scope: fspId ?? 'hub',
            ...toLiveKpi(vector),
        };
    }

    /** HUB callers (no fspId) see all FSPs; DFSP callers are scoped to their own fspId. */
    private static resolveAccessScope(
        claims: AccessTokenClaims | undefined,
    ): GetDashboardQuery.AccessScope | undefined {
        if (claims == null || claims.fspId == null) {
            return undefined;
        }

        return new GetDashboardQuery.AccessScope(claims.fspId);
    }

    private static readonly MAX_RANGE_MONTHS = 4;

    private static offsetMinutesForTimeZone(date: Date, timeZone: string): number {
        const offset = new Intl.DateTimeFormat('en-US', {
            timeZone,
            timeZoneName: 'shortOffset',
        }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
        const match = offset.match(/GMT([+\-])(\d{1,2})(?::?(\d{2}))?/i);

        if (match == null) {
            return 0;
        }

        const sign = match[1] === '-' ? -1 : 1;

        return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
    }

    private static zonedDateTimeParts(date: Date, timeZone: string): {
        year: number;
        month: number;
        day: number;
        hour: number;
        minute: number;
        second: number;
    } {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(date);
        const value = (type: Intl.DateTimeFormatPartTypes): number =>
            Number(parts.find((part) => part.type === type)?.value ?? 0);

        return {
            year: value('year'),
            month: value('month'),
            day: value('day'),
            hour: value('hour'),
            minute: value('minute'),
            second: value('second'),
        };
    }

    private static zonedLocalToUtc(
        year: number,
        month: number,
        day: number,
        hour: number,
        minute: number,
        second: number,
        timeZone: string,
    ): Date {
        const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
        const first = utcGuess - DashboardAuditController.offsetMinutesForTimeZone(new Date(utcGuess), timeZone) * 60_000;
        const resolved = utcGuess - DashboardAuditController.offsetMinutesForTimeZone(new Date(first), timeZone) * 60_000;

        return new Date(resolved);
    }

    /**
     * Adds calendar months in the given IANA time zone without day overflow
     * (e.g. 31 May + 4 months → 30 Sep in that zone, not 1 Oct).
     */
    private static addMonthsInTimeZone(date: Date, months: number, timeZone: string): Date {
        const parts = DashboardAuditController.zonedDateTimeParts(date, timeZone);
        const totalMonths = parts.year * 12 + (parts.month - 1) + months;
        const year = Math.floor(totalMonths / 12);
        const month = (totalMonths % 12) + 1;
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const day = Math.min(parts.day, lastDay);

        return DashboardAuditController.zonedLocalToUtc(
            year,
            month,
            day,
            parts.hour,
            parts.minute,
            parts.second,
            timeZone,
        );
    }

    private static parseRange(
        fromValue: string | undefined,
        toValue: string | undefined,
        timeZone: string,
    ): GetDashboardQuery.DateRange | undefined {
        const from = QueryParamsUtil.toOptionalDate(fromValue, 'from');
        const to = QueryParamsUtil.toOptionalDate(toValue, 'to');

        if (from == null && to == null) {
            return undefined;
        }

        if (from == null || to == null) {
            throw new BadRequestException('from and to must be provided together.');
        }

        if (from >= to) {
            throw new BadRequestException('from must be before to.');
        }

        const limit = DashboardAuditController.addMonthsInTimeZone(
            from,
            DashboardAuditController.MAX_RANGE_MONTHS,
            timeZone,
        );
        if (to.getTime() > limit.getTime()) {
            throw new BadRequestException('Custom range cannot exceed 4 months.');
        }

        return new GetDashboardQuery.DateRange(from, to);
    }

    private static parseTimeZone(value: string | undefined): string {
        const timeZone = QueryParamsUtil.toOptionalString(value) ?? 'UTC';

        try {
            new Intl.DateTimeFormat('en-US', {timeZone}).format(new Date());
        } catch {
            throw new BadRequestException('timeZone must be a valid IANA time zone.');
        }

        return timeZone;
    }
}

import {Controller, Get, Inject} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {AccessTokenClaims, PermissionKey, RequiresPermission} from '@core/auth/domain';
import {GetDashboardQuery, LiveStatsStore, toLiveKpi} from '@core/audit/domain';
import {AuthUser} from '../../decorators';

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
    ): Promise<GetDashboardQuery.Output> {
        const accessScope = DashboardAuditController.resolveAccessScope(claims);

        return this.queryBus.execute(
            new GetDashboardQuery(new GetDashboardQuery.Input(accessScope)),
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
}

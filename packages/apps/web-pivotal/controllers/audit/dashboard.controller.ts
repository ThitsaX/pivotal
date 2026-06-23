import {Controller, Get, Inject} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {AccessTokenClaims, PermissionKey, RequiresPermission} from '@core/auth/domain';
import {GetDashboardQuery} from '@core/audit/domain';
import {AuthUser} from '../../decorators';

@Controller('audit/dashboard')
export class DashboardAuditController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
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

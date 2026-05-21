import {BadRequestException, Controller, Get, Inject, Param, Query} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {
    AccessTokenClaims,
    DFSP_USER_ROLE_CODE,
    PermissionKey,
    RequiresPermission,
} from '@core/auth/domain';
import {FindTransactionsQuery, GetTransactionQuery} from '@core/audit/domain';
import {PartyIdType, TransactionScenario} from '@shared/fspiop';
import {AuthUser} from '../../decorators';
import {QueryParamsUtil} from '../query-params.util';

@Controller('audit/transactions')
export class TransactionsAuditController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get()
    @RequiresPermission(PermissionKey.AUDIT_TRANSACTIONS_LIST)
    async findTransactions(
        @AuthUser() claims: AccessTokenClaims | undefined,
        @Query('payerFsp') payerFsp: string | undefined,
        @Query('payeeFsp') payeeFsp: string | undefined,
        @Query('payerIdType') payerIdType: string | undefined,
        @Query('payerId') payerId: string | undefined,
        @Query('payerSubId') payerSubId: string | undefined,
        @Query('payeeIdType') payeeIdType: string | undefined,
        @Query('payeeId') payeeId: string | undefined,
        @Query('payeeSubId') payeeSubId: string | undefined,
        @Query('transferId') transferId: string | undefined,
        @Query('flow') flow: string | undefined,
        @Query('transferType') transferType: string | undefined,
        @Query('subScenario') subScenario: string | undefined,
        @Query('transactionStartAtStart') transactionStartAtStart: string | undefined,
        @Query('transactionStartAtEnd') transactionStartAtEnd: string | undefined,
        @Query('transactionCompletedAtStart') transactionCompletedAtStart: string | undefined,
        @Query('transactionCompletedAtEnd') transactionCompletedAtEnd: string | undefined,
        @Query('error') error: string | undefined,
        @Query('dispute') dispute: string | undefined,
        @Query('page') page: string | undefined,
        @Query('size') size: string | undefined,
        @Query('orderColumn') orderColumn: string | undefined,
        @Query('orderDirection') orderDirection: string | undefined,
    ): Promise<FindTransactionsQuery.Output> {
        const accessScope = TransactionsAuditController.resolveListAccessScope(claims, payerFsp, payeeFsp);

        const criteria = new FindTransactionsQuery.Criteria(
            QueryParamsUtil.toOptionalString(payerFsp),
            QueryParamsUtil.toOptionalString(payeeFsp),
            QueryParamsUtil.toOptionalEnum(payerIdType, PartyIdType, 'payerIdType'),
            QueryParamsUtil.toOptionalString(payerId),
            QueryParamsUtil.toOptionalNullableString(payerSubId),
            QueryParamsUtil.toOptionalEnum(payeeIdType, PartyIdType, 'payeeIdType'),
            QueryParamsUtil.toOptionalString(payeeId),
            QueryParamsUtil.toOptionalNullableString(payeeSubId),
            QueryParamsUtil.toOptionalString(transferId),
            QueryParamsUtil.toOptionalInteger(flow, 'flow'),
            QueryParamsUtil.toOptionalEnum(transferType, TransactionScenario, 'transferType'),
            QueryParamsUtil.toOptionalString(subScenario),
            QueryParamsUtil.toDateRange(
                transactionStartAtStart,
                transactionStartAtEnd,
                'transactionStartAtStart',
                'transactionStartAtEnd',
                (start?: Date, end?: Date) => new FindTransactionsQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toDateRange(
                transactionCompletedAtStart,
                transactionCompletedAtEnd,
                'transactionCompletedAtStart',
                'transactionCompletedAtEnd',
                (start?: Date, end?: Date) => new FindTransactionsQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toOptionalBoolean(error, 'error'),
            QueryParamsUtil.toOptionalBoolean(dispute, 'dispute'),
        );

        const pageRequest = new FindTransactionsQuery.PageRequest(
            QueryParamsUtil.toNonNegativeInteger(page, 0, 'page'),
            QueryParamsUtil.toPositiveInteger(size, 20, 'size'),
        );

        const order = new FindTransactionsQuery.Order(
            QueryParamsUtil.toEnum(
                orderColumn,
                FindTransactionsQuery.Order.Column,
                FindTransactionsQuery.Order.Column.TransactionStartAt,
                'orderColumn',
            ),
            QueryParamsUtil.toEnum(
                orderDirection,
                FindTransactionsQuery.Order.Direction,
                FindTransactionsQuery.Order.Direction.Desc,
                'orderDirection',
            ),
        );

        return this.queryBus.execute(
            new FindTransactionsQuery(
                new FindTransactionsQuery.Input(criteria, pageRequest, order, accessScope),
            ),
        );
    }

    @Get(':transferId')
    @RequiresPermission(PermissionKey.AUDIT_TRANSACTIONS_VIEW)
    async getTransaction(
        @AuthUser() claims: AccessTokenClaims | undefined,
        @Param('transferId') transferId: string,
    ): Promise<GetTransactionQuery.Output> {
        const accessScope = TransactionsAuditController.resolveDetailAccessScope(claims);

        return this.queryBus.execute(
            new GetTransactionQuery(
                new GetTransactionQuery.Input(transferId, accessScope),
            ),
        );
    }

    private static resolveListAccessScope(
        claims: AccessTokenClaims | undefined,
        payerFsp: string | undefined,
        payeeFsp: string | undefined,
    ): FindTransactionsQuery.AccessScope | undefined {

        if (claims == null || claims.role !== DFSP_USER_ROLE_CODE) {
            return undefined;
        }

        if (claims.fspId == null) {
            throw new BadRequestException({
                code: 'AUTH_FSP_SCOPE_MISSING',
                message: 'DFSP user has no fspId associated with the session.',
            });
        }

        const scopedFspId = claims.fspId;

        if (payerFsp !== undefined && payerFsp !== scopedFspId) {
            throw new BadRequestException({
                code: 'AUTH_FSP_SCOPE_VIOLATION',
                message: 'payerFsp must match the caller fspId.',
            });
        }

        if (payeeFsp !== undefined && payeeFsp !== scopedFspId) {
            throw new BadRequestException({
                code: 'AUTH_FSP_SCOPE_VIOLATION',
                message: 'payeeFsp must match the caller fspId.',
            });
        }

        return new FindTransactionsQuery.AccessScope(scopedFspId);
    }

    private static resolveDetailAccessScope(
        claims: AccessTokenClaims | undefined,
    ): GetTransactionQuery.AccessScope | undefined {

        if (claims == null || claims.role !== DFSP_USER_ROLE_CODE) {
            return undefined;
        }

        if (claims.fspId == null) {
            throw new BadRequestException({
                code: 'AUTH_FSP_SCOPE_MISSING',
                message: 'DFSP user has no fspId associated with the session.',
            });
        }

        return new GetTransactionQuery.AccessScope(claims.fspId);
    }
}

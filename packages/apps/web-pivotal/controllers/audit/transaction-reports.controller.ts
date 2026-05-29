import {BadRequestException, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Query} from '@nestjs/common';
import {CommandBus, QueryBus} from '@nestjs/cqrs';
import {AccessTokenClaims, PermissionKey, RequiresPermission} from '@core/auth/domain';
import {
    CreateTransactionReportCommand,
    FindTransactionsQuery,
    GetReportDownloadStatusQuery,
    GetReportDownloadUrlQuery,
} from '@core/audit/domain';
import {PartyIdType, TransactionScenario} from '@shared/fspiop';
import {AuthUser} from '../../decorators';
import {QueryParamsUtil} from '../query-params.util';

@Controller('audit/transactions/reports')
export class TransactionReportsAuditController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Post()
    @HttpCode(200)
    @RequiresPermission(PermissionKey.AUDIT_TRANSACTIONS_LIST)
    async requestTransactionReport(
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
        @Query('orderColumn') orderColumn: string | undefined,
        @Query('orderDirection') orderDirection: string | undefined,
        @Query('fileType') fileType: string | undefined,
    ): Promise<CreateTransactionReportCommand.Output> {
        const accessScope = TransactionReportsAuditController.resolveListAccessScope(claims, payerFsp, payeeFsp);
        const criteria = TransactionReportsAuditController.toCriteria(
            payerFsp,
            payeeFsp,
            payerIdType,
            payerId,
            payerSubId,
            payeeIdType,
            payeeId,
            payeeSubId,
            transferId,
            flow,
            transferType,
            subScenario,
            transactionStartAtStart,
            transactionStartAtEnd,
            transactionCompletedAtStart,
            transactionCompletedAtEnd,
            error,
            dispute,
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

        return this.commandBus.execute(
            new CreateTransactionReportCommand(
                new CreateTransactionReportCommand.Input(
                    criteria,
                    order,
                    QueryParamsUtil.toOptionalString(fileType) ?? 'csv',
                    claims?.sub,
                    accessScope,
                ),
            ),
        );
    }

    @Get(':requestId/status')
    @RequiresPermission(PermissionKey.AUDIT_TRANSACTIONS_LIST)
    async getReportStatus(
        @AuthUser() claims: AccessTokenClaims | undefined,
        @Param('requestId') requestId: string,
    ): Promise<GetReportDownloadStatusQuery.Output> {
        const output = await this.queryBus.execute<GetReportDownloadStatusQuery, GetReportDownloadStatusQuery.Output>(
            new GetReportDownloadStatusQuery(
                new GetReportDownloadStatusQuery.Input(
                    TransactionReportsAuditController.requireRequestId(requestId),
                    TransactionReportsAuditController.toStatusAccessScope(claims),
                ),
            ),
        );

        if (!output.found) {
            throw new NotFoundException({
                code:    'REPORT_REQUEST_NOT_FOUND',
                message: 'Report request was not found.',
            });
        }

        return output;
    }

    @Get(':requestId/download-url')
    @RequiresPermission(PermissionKey.AUDIT_TRANSACTIONS_LIST)
    async getReportDownloadUrl(
        @AuthUser() claims: AccessTokenClaims | undefined,
        @Param('requestId') requestId: string,
    ): Promise<GetReportDownloadUrlQuery.Output> {
        const output = await this.queryBus.execute<GetReportDownloadUrlQuery, GetReportDownloadUrlQuery.Output>(
            new GetReportDownloadUrlQuery(
                new GetReportDownloadUrlQuery.Input(
                    TransactionReportsAuditController.requireRequestId(requestId),
                    TransactionReportsAuditController.toUrlAccessScope(claims),
                ),
            ),
        );

        if (!output.found) {
            throw new NotFoundException({
                code:    'REPORT_REQUEST_NOT_FOUND',
                message: 'Report request was not found.',
            });
        }

        return output;
    }

    private static toCriteria(
        payerFsp: string | undefined,
        payeeFsp: string | undefined,
        payerIdType: string | undefined,
        payerId: string | undefined,
        payerSubId: string | undefined,
        payeeIdType: string | undefined,
        payeeId: string | undefined,
        payeeSubId: string | undefined,
        transferId: string | undefined,
        flow: string | undefined,
        transferType: string | undefined,
        subScenario: string | undefined,
        transactionStartAtStart: string | undefined,
        transactionStartAtEnd: string | undefined,
        transactionCompletedAtStart: string | undefined,
        transactionCompletedAtEnd: string | undefined,
        error: string | undefined,
        dispute: string | undefined,
    ): FindTransactionsQuery.Criteria {
        return new FindTransactionsQuery.Criteria(
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
    }

    private static resolveListAccessScope(
        claims: AccessTokenClaims | undefined,
        payerFsp: string | undefined,
        payeeFsp: string | undefined,
    ): FindTransactionsQuery.AccessScope | undefined {
        if (claims == null || claims.fspId == null) {
            return undefined;
        }

        const scopedFspId = claims.fspId;

        if (payerFsp !== undefined && payerFsp !== scopedFspId) {
            throw new BadRequestException({
                code:    'AUTH_FSP_SCOPE_VIOLATION',
                message: 'payerFsp must match the caller fspId.',
            });
        }

        if (payeeFsp !== undefined && payeeFsp !== scopedFspId) {
            throw new BadRequestException({
                code:    'AUTH_FSP_SCOPE_VIOLATION',
                message: 'payeeFsp must match the caller fspId.',
            });
        }

        return new FindTransactionsQuery.AccessScope(scopedFspId);
    }

    private static toStatusAccessScope(
        claims: AccessTokenClaims | undefined,
    ): GetReportDownloadStatusQuery.AccessScope | undefined {
        return claims?.fspId == null ? undefined : new GetReportDownloadStatusQuery.AccessScope(claims.fspId);
    }

    private static toUrlAccessScope(
        claims: AccessTokenClaims | undefined,
    ): GetReportDownloadUrlQuery.AccessScope | undefined {
        return claims?.fspId == null ? undefined : new GetReportDownloadUrlQuery.AccessScope(claims.fspId);
    }

    private static requireRequestId(requestId: string): string {
        if (!/^\d+$/.test(requestId)) {
            throw new BadRequestException({
                code:    'REPORT_REQUEST_ID_INVALID',
                message: 'requestId must be a numeric string.',
            });
        }

        return requestId;
    }
}

import {Controller, Get, Inject, Param, Query} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {FindTransactionsQuery, GetTransactionQuery} from '@core/audit/domain';
import {PartyIdType, TransactionScenario} from '@shared/fspiop';
import {QueryParamsUtil} from '../query-params.util';

@Controller('audit/transactions')
export class TransactionsAuditController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get()
    async findTransactions(
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
                new FindTransactionsQuery.Input(criteria, pageRequest, order),
            ),
        );
    }

    @Get(':transferId')
    async getTransaction(
        @Param('transferId') transferId: string,
    ): Promise<GetTransactionQuery.Output> {
        return this.queryBus.execute(
            new GetTransactionQuery(
                new GetTransactionQuery.Input(transferId),
            ),
        );
    }
}

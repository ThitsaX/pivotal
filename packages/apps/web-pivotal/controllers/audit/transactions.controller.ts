import {Controller, Get, Inject, Query} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {FindTransactionQuery} from '@core/audit/domain';
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
    ): Promise<FindTransactionQuery.Output> {
        const criteria = new FindTransactionQuery.Criteria(
            QueryParamsUtil.toOptionalString(payerFsp),
            QueryParamsUtil.toOptionalString(payeeFsp),
            QueryParamsUtil.toOptionalEnum(payerIdType, PartyIdType, 'payerIdType'),
            QueryParamsUtil.toOptionalString(payerId),
            QueryParamsUtil.toOptionalNullableString(payerSubId),
            QueryParamsUtil.toOptionalEnum(payeeIdType, PartyIdType, 'payeeIdType'),
            QueryParamsUtil.toOptionalString(payeeId),
            QueryParamsUtil.toOptionalNullableString(payeeSubId),
            QueryParamsUtil.toOptionalEnum(transferType, TransactionScenario, 'transferType'),
            QueryParamsUtil.toOptionalString(subScenario),
            QueryParamsUtil.toDateRange(
                transactionStartAtStart,
                transactionStartAtEnd,
                'transactionStartAtStart',
                'transactionStartAtEnd',
                (start?: Date, end?: Date) => new FindTransactionQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toDateRange(
                transactionCompletedAtStart,
                transactionCompletedAtEnd,
                'transactionCompletedAtStart',
                'transactionCompletedAtEnd',
                (start?: Date, end?: Date) => new FindTransactionQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toOptionalBoolean(error, 'error'),
            QueryParamsUtil.toOptionalBoolean(dispute, 'dispute'),
        );

        const pageRequest = new FindTransactionQuery.PageRequest(
            QueryParamsUtil.toNonNegativeInteger(page, 0, 'page'),
            QueryParamsUtil.toPositiveInteger(size, 20, 'size'),
        );

        const order = new FindTransactionQuery.Order(
            QueryParamsUtil.toEnum(
                orderColumn,
                FindTransactionQuery.Order.Column,
                FindTransactionQuery.Order.Column.TransactionStartAt,
                'orderColumn',
            ),
            QueryParamsUtil.toEnum(
                orderDirection,
                FindTransactionQuery.Order.Direction,
                FindTransactionQuery.Order.Direction.Desc,
                'orderDirection',
            ),
        );

        return this.queryBus.execute(
            new FindTransactionQuery(
                new FindTransactionQuery.Input(criteria, pageRequest, order),
            ),
        );
    }
}

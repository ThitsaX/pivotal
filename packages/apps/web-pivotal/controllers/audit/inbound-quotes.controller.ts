import {Controller, Get, Inject, Query} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {FindInboundQuotesQuery} from '@core/audit/domain';
import {QueryParamsUtil} from '../query-params.util';

@Controller('audit/inbound/quotes')
export class InboundQuotesAuditController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get()
    async findInboundQuotes(
        @Query('payerFsp') payerFsp: string | undefined,
        @Query('payeeFsp') payeeFsp: string | undefined,
        @Query('quoteId') quoteId: string | undefined,
        @Query('createdAtStart') createdAtStart: string | undefined,
        @Query('createdAtEnd') createdAtEnd: string | undefined,
        @Query('completedAtStart') completedAtStart: string | undefined,
        @Query('completedAtEnd') completedAtEnd: string | undefined,
        @Query('error') error: string | undefined,
        @Query('page') page: string | undefined,
        @Query('size') size: string | undefined,
        @Query('orderColumn') orderColumn: string | undefined,
        @Query('orderDirection') orderDirection: string | undefined,
    ): Promise<FindInboundQuotesQuery.Output> {
        const criteria = new FindInboundQuotesQuery.Criteria(
            QueryParamsUtil.toOptionalString(payerFsp),
            QueryParamsUtil.toOptionalString(payeeFsp),
            QueryParamsUtil.toOptionalString(quoteId),
            QueryParamsUtil.toDateRange(
                createdAtStart,
                createdAtEnd,
                'createdAtStart',
                'createdAtEnd',
                (start?: Date, end?: Date) => new FindInboundQuotesQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toDateRange(
                completedAtStart,
                completedAtEnd,
                'completedAtStart',
                'completedAtEnd',
                (start?: Date, end?: Date) => new FindInboundQuotesQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toOptionalBoolean(error, 'error'),
        );

        const pageRequest = new FindInboundQuotesQuery.PageRequest(
            QueryParamsUtil.toNonNegativeInteger(page, 0, 'page'),
            QueryParamsUtil.toPositiveInteger(size, 20, 'size'),
        );

        const order = new FindInboundQuotesQuery.Order(
            QueryParamsUtil.toEnum(
                orderColumn,
                FindInboundQuotesQuery.Order.Column,
                FindInboundQuotesQuery.Order.Column.CreatedAt,
                'orderColumn',
            ),
            QueryParamsUtil.toEnum(
                orderDirection,
                FindInboundQuotesQuery.Order.Direction,
                FindInboundQuotesQuery.Order.Direction.Desc,
                'orderDirection',
            ),
        );

        return this.queryBus.execute(
            new FindInboundQuotesQuery(
                new FindInboundQuotesQuery.Input(criteria, pageRequest, order),
            ),
        );
    }
}

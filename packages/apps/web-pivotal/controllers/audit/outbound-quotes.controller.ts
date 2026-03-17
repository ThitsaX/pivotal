import {Controller, Get, Inject, Query} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {FindOutboundQuotesQuery} from '@core/audit/domain';
import {QueryParamsUtil} from '../query-params.util';

@Controller('audit/outbound/quotes')
export class OutboundQuotesAuditController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get()
    async findOutboundQuotes(
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
    ): Promise<FindOutboundQuotesQuery.Output> {
        const criteria = new FindOutboundQuotesQuery.Criteria(
            QueryParamsUtil.toOptionalString(payerFsp),
            QueryParamsUtil.toOptionalString(payeeFsp),
            QueryParamsUtil.toOptionalString(quoteId),
            QueryParamsUtil.toDateRange(
                createdAtStart,
                createdAtEnd,
                'createdAtStart',
                'createdAtEnd',
                (start?: Date, end?: Date) => new FindOutboundQuotesQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toDateRange(
                completedAtStart,
                completedAtEnd,
                'completedAtStart',
                'completedAtEnd',
                (start?: Date, end?: Date) => new FindOutboundQuotesQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toOptionalBoolean(error, 'error'),
        );

        const pageRequest = new FindOutboundQuotesQuery.PageRequest(
            QueryParamsUtil.toNonNegativeInteger(page, 0, 'page'),
            QueryParamsUtil.toPositiveInteger(size, 20, 'size'),
        );

        const order = new FindOutboundQuotesQuery.Order(
            QueryParamsUtil.toEnum(
                orderColumn,
                FindOutboundQuotesQuery.Order.Column,
                FindOutboundQuotesQuery.Order.Column.CreatedAt,
                'orderColumn',
            ),
            QueryParamsUtil.toEnum(
                orderDirection,
                FindOutboundQuotesQuery.Order.Direction,
                FindOutboundQuotesQuery.Order.Direction.Desc,
                'orderDirection',
            ),
        );

        return this.queryBus.execute(
            new FindOutboundQuotesQuery(
                new FindOutboundQuotesQuery.Input(criteria, pageRequest, order),
            ),
        );
    }
}

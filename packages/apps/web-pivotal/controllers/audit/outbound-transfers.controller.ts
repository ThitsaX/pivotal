import {Controller, Get, Inject, Query} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {FindOutboundTransfersQuery} from '@core/audit/domain';
import {QueryParamsUtil} from '../query-params.util';

@Controller('audit/outbound/transfers')
export class OutboundTransfersAuditController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get()
    async findOutboundTransfers(
        @Query('payerFsp') payerFsp: string | undefined,
        @Query('payeeFsp') payeeFsp: string | undefined,
        @Query('transferId') transferId: string | undefined,
        @Query('createdAtStart') createdAtStart: string | undefined,
        @Query('createdAtEnd') createdAtEnd: string | undefined,
        @Query('completedAtStart') completedAtStart: string | undefined,
        @Query('completedAtEnd') completedAtEnd: string | undefined,
        @Query('error') error: string | undefined,
        @Query('page') page: string | undefined,
        @Query('size') size: string | undefined,
        @Query('orderColumn') orderColumn: string | undefined,
        @Query('orderDirection') orderDirection: string | undefined,
    ): Promise<FindOutboundTransfersQuery.Output> {
        const criteria = new FindOutboundTransfersQuery.Criteria(
            QueryParamsUtil.toOptionalString(payerFsp),
            QueryParamsUtil.toOptionalString(payeeFsp),
            QueryParamsUtil.toOptionalString(transferId),
            QueryParamsUtil.toDateRange(
                createdAtStart,
                createdAtEnd,
                'createdAtStart',
                'createdAtEnd',
                (start?: Date, end?: Date) => new FindOutboundTransfersQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toDateRange(
                completedAtStart,
                completedAtEnd,
                'completedAtStart',
                'completedAtEnd',
                (start?: Date, end?: Date) => new FindOutboundTransfersQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toOptionalBoolean(error, 'error'),
        );

        const pageRequest = new FindOutboundTransfersQuery.PageRequest(
            QueryParamsUtil.toNonNegativeInteger(page, 0, 'page'),
            QueryParamsUtil.toPositiveInteger(size, 20, 'size'),
        );

        const order = new FindOutboundTransfersQuery.Order(
            QueryParamsUtil.toEnum(
                orderColumn,
                FindOutboundTransfersQuery.Order.Column,
                FindOutboundTransfersQuery.Order.Column.CreatedAt,
                'orderColumn',
            ),
            QueryParamsUtil.toEnum(
                orderDirection,
                FindOutboundTransfersQuery.Order.Direction,
                FindOutboundTransfersQuery.Order.Direction.Desc,
                'orderDirection',
            ),
        );

        return this.queryBus.execute(
            new FindOutboundTransfersQuery(
                new FindOutboundTransfersQuery.Input(criteria, pageRequest, order),
            ),
        );
    }
}

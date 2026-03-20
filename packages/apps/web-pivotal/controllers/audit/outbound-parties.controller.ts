import {Controller, Get, Inject, Query} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {FindOutboundPartiesQuery} from '@core/audit/domain';
import {PartyIdType} from '@shared/fspiop';
import {QueryParamsUtil} from '../query-params.util';

@Controller('audit/outbound/parties')
export class OutboundPartiesAuditController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get()
    async findOutboundParties(
        @Query('payerFsp') payerFsp: string | undefined,
        @Query('payeeFsp') payeeFsp: string | undefined,
        @Query('partyIdType') partyIdType: string | undefined,
        @Query('partyId') partyId: string | undefined,
        @Query('subId') subId: string | undefined,
        @Query('createdAtStart') createdAtStart: string | undefined,
        @Query('createdAtEnd') createdAtEnd: string | undefined,
        @Query('completedAtStart') completedAtStart: string | undefined,
        @Query('completedAtEnd') completedAtEnd: string | undefined,
        @Query('error') error: string | undefined,
        @Query('page') page: string | undefined,
        @Query('size') size: string | undefined,
        @Query('orderColumn') orderColumn: string | undefined,
        @Query('orderDirection') orderDirection: string | undefined,
    ): Promise<FindOutboundPartiesQuery.Output> {
        const criteria = new FindOutboundPartiesQuery.Criteria(
            QueryParamsUtil.toOptionalString(payerFsp),
            QueryParamsUtil.toOptionalString(payeeFsp),
            QueryParamsUtil.toOptionalEnum(partyIdType, PartyIdType, 'partyIdType'),
            QueryParamsUtil.toOptionalString(partyId),
            QueryParamsUtil.toOptionalNullableString(subId),
            QueryParamsUtil.toDateRange(
                createdAtStart,
                createdAtEnd,
                'createdAtStart',
                'createdAtEnd',
                (start?: Date, end?: Date) => new FindOutboundPartiesQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toDateRange(
                completedAtStart,
                completedAtEnd,
                'completedAtStart',
                'completedAtEnd',
                (start?: Date, end?: Date) => new FindOutboundPartiesQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toOptionalBoolean(error, 'error'),
        );

        const pageRequest = new FindOutboundPartiesQuery.PageRequest(
            QueryParamsUtil.toNonNegativeInteger(page, 0, 'page'),
            QueryParamsUtil.toPositiveInteger(size, 20, 'size'),
        );

        const order = new FindOutboundPartiesQuery.Order(
            QueryParamsUtil.toEnum(
                orderColumn,
                FindOutboundPartiesQuery.Order.Column,
                FindOutboundPartiesQuery.Order.Column.CreatedAt,
                'orderColumn',
            ),
            QueryParamsUtil.toEnum(
                orderDirection,
                FindOutboundPartiesQuery.Order.Direction,
                FindOutboundPartiesQuery.Order.Direction.Desc,
                'orderDirection',
            ),
        );

        return this.queryBus.execute(
            new FindOutboundPartiesQuery(
                new FindOutboundPartiesQuery.Input(criteria, pageRequest, order),
            ),
        );
    }
}

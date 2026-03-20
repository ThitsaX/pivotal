import {Controller, Get, Inject, Query} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {FindInboundPartiesQuery} from '@core/audit/domain';
import {PartyIdType} from '@shared/fspiop';
import {QueryParamsUtil} from '../query-params.util';

@Controller('audit/inbound/parties')
export class InboundPartiesAuditController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get()
    async findInboundParties(
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
    ): Promise<FindInboundPartiesQuery.Output> {
        const criteria = new FindInboundPartiesQuery.Criteria(
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
                (start?: Date, end?: Date) => new FindInboundPartiesQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toDateRange(
                completedAtStart,
                completedAtEnd,
                'completedAtStart',
                'completedAtEnd',
                (start?: Date, end?: Date) => new FindInboundPartiesQuery.DateRange(start, end),
            ),
            QueryParamsUtil.toOptionalBoolean(error, 'error'),
        );

        const pageRequest = new FindInboundPartiesQuery.PageRequest(
            QueryParamsUtil.toNonNegativeInteger(page, 0, 'page'),
            QueryParamsUtil.toPositiveInteger(size, 20, 'size'),
        );

        const order = new FindInboundPartiesQuery.Order(
            QueryParamsUtil.toEnum(
                orderColumn,
                FindInboundPartiesQuery.Order.Column,
                FindInboundPartiesQuery.Order.Column.CreatedAt,
                'orderColumn',
            ),
            QueryParamsUtil.toEnum(
                orderDirection,
                FindInboundPartiesQuery.Order.Direction,
                FindInboundPartiesQuery.Order.Direction.Desc,
                'orderDirection',
            ),
        );

        return this.queryBus.execute(
            new FindInboundPartiesQuery(
                new FindInboundPartiesQuery.Input(criteria, pageRequest, order),
            ),
        );
    }
}

import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {OutboundQuotesRepository} from '../repository';
import {FindOutboundQuotesQuery} from './find-outbound-quotes.query';

@QueryHandler(FindOutboundQuotesQuery)
export class FindOutboundQuotesHandler
    implements IQueryHandler<FindOutboundQuotesQuery, FindOutboundQuotesQuery.Output> {

    constructor(
        @Inject(OutboundQuotesRepository)
        private readonly repository: OutboundQuotesRepository,
    ) {
    }

    async execute(query: FindOutboundQuotesQuery): Promise<FindOutboundQuotesQuery.Output> {
        const {criteria, pageRequest, order} = query.input;

        return this.repository.findOutboundQuotes(criteria, pageRequest, order);
    }
}

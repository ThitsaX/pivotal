import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {InboundQuotesRepository} from '../repository';
import {FindInboundQuotesQuery} from './find-inbound-quotes.query';

@QueryHandler(FindInboundQuotesQuery)
export class FindInboundQuotesHandler
    implements IQueryHandler<FindInboundQuotesQuery, FindInboundQuotesQuery.Output> {

    constructor(
        @Inject(InboundQuotesRepository)
        private readonly repository: InboundQuotesRepository,
    ) {
    }

    async execute(query: FindInboundQuotesQuery): Promise<FindInboundQuotesQuery.Output> {
        const {criteria, pageRequest, order} = query.input;

        return this.repository.findInboundQuotes(criteria, pageRequest, order);
    }
}

import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {InboundPartiesRepository} from '../repository';
import {FindInboundPartiesQuery} from './find-inbound-parties.query';

@QueryHandler(FindInboundPartiesQuery)
export class FindInboundPartiesHandler
    implements IQueryHandler<FindInboundPartiesQuery, FindInboundPartiesQuery.Output> {

    constructor(
        @Inject(InboundPartiesRepository)
        private readonly repository: InboundPartiesRepository,
    ) {
    }

    async execute(query: FindInboundPartiesQuery): Promise<FindInboundPartiesQuery.Output> {
        const {criteria, pageRequest, order} = query.input;

        return this.repository.findInboundParties(criteria, pageRequest, order);
    }
}

import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {OutboundPartiesRepository} from '../repository';
import {FindOutboundPartiesQuery} from './find-outbound-parties.query';

@QueryHandler(FindOutboundPartiesQuery)
export class FindOutboundPartiesHandler
    implements IQueryHandler<FindOutboundPartiesQuery, FindOutboundPartiesQuery.Output> {

    constructor(
        @Inject(OutboundPartiesRepository)
        private readonly repository: OutboundPartiesRepository,
    ) {
    }

    async execute(query: FindOutboundPartiesQuery): Promise<FindOutboundPartiesQuery.Output> {
        const {criteria, pageRequest, order} = query.input;

        return this.repository.findOutboundParties(criteria, pageRequest, order);
    }
}

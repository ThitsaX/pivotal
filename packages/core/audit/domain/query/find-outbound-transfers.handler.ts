import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {OutboundTransfersRepository} from '../repository';
import {FindOutboundTransfersQuery} from './find-outbound-transfers.query';

@QueryHandler(FindOutboundTransfersQuery)
export class FindOutboundTransfersHandler
    implements IQueryHandler<FindOutboundTransfersQuery, FindOutboundTransfersQuery.Output> {

    constructor(
        @Inject(OutboundTransfersRepository)
        private readonly repository: OutboundTransfersRepository,
    ) {
    }

    async execute(query: FindOutboundTransfersQuery): Promise<FindOutboundTransfersQuery.Output> {
        const {criteria, pageRequest, order} = query.input;

        return this.repository.findOutboundTransfers(criteria, pageRequest, order);
    }
}

import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {InboundTransfersRepository} from '../repository';
import {FindInboundTransfersQuery} from './find-inbound-transfers.query';

@QueryHandler(FindInboundTransfersQuery)
export class FindInboundTransfersHandler
    implements IQueryHandler<FindInboundTransfersQuery, FindInboundTransfersQuery.Output> {

    constructor(
        @Inject(InboundTransfersRepository)
        private readonly repository: InboundTransfersRepository,
    ) {
    }

    async execute(query: FindInboundTransfersQuery): Promise<FindInboundTransfersQuery.Output> {
        const {criteria, pageRequest, order} = query.input;

        return this.repository.findInboundTransfers(criteria, pageRequest, order);
    }
}

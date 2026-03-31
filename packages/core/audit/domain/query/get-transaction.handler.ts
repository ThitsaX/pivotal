import {Inject, NotFoundException} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../repository';
import {GetTransactionQuery} from './get-transaction.query';

@QueryHandler(GetTransactionQuery)
export class GetTransactionHandler
    implements IQueryHandler<GetTransactionQuery, GetTransactionQuery.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly repository: TransactionRepository,
    ) {
    }

    async execute(query: GetTransactionQuery): Promise<GetTransactionQuery.Output> {
        const record = await this.repository.get(query.input.transferId);

        if (record == null) {
            throw new NotFoundException(`Transaction ${query.input.transferId} was not found.`);
        }

        return new GetTransactionQuery.Output(record);
    }
}

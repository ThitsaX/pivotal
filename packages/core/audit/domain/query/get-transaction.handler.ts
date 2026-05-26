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
        const {transferId, accessScope} = query.input;

        const record = await this.repository.get(transferId);

        if (record == null) {
            throw new NotFoundException(`Transaction ${transferId} was not found.`);
        }

        if (accessScope !== undefined) {
            const payerFsp = record.payerFsp;
            const payeeFsp = record.payeeFsp;

            if (payerFsp !== accessScope.fspId && payeeFsp !== accessScope.fspId) {
                throw new NotFoundException(`Transaction ${transferId} was not found.`);
            }
        }

        return new GetTransactionQuery.Output(record);
    }
}

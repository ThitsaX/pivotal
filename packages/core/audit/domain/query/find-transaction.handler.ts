import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../repository';
import {FindTransactionQuery} from './find-transaction.query';

@QueryHandler(FindTransactionQuery)
export class FindTransactionHandler
    implements IQueryHandler<FindTransactionQuery, FindTransactionQuery.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly repository: TransactionRepository,
    ) {
    }

    async execute(query: FindTransactionQuery): Promise<FindTransactionQuery.Output> {
        const {criteria, pageRequest, order} = query.input;

        return this.repository.find(criteria, pageRequest, order);
    }
}

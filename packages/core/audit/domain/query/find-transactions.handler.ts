import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../repository';
import {FindTransactionsQuery} from './find-transactions.query';

@QueryHandler(FindTransactionsQuery)
export class FindTransactionsHandler
    implements IQueryHandler<FindTransactionsQuery, FindTransactionsQuery.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly repository: TransactionRepository,
    ) {
    }

    async execute(query: FindTransactionsQuery): Promise<FindTransactionsQuery.Output> {
        const {criteria, cursor, order, accessScope} = query.input;

        return this.repository.find(criteria, cursor, order, accessScope);
    }
}

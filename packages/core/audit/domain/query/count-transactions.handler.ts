// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../repository';
import {CountTransactionsQuery} from './count-transactions.query';

@QueryHandler(CountTransactionsQuery)
export class CountTransactionsHandler
    implements IQueryHandler<CountTransactionsQuery, CountTransactionsQuery.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly repository: TransactionRepository,
    ) {
    }

    async execute(query: CountTransactionsQuery): Promise<CountTransactionsQuery.Output> {
        const {maxLimit, criteria, accessScope} = query.input;

        const {count, capped} = await this.repository.count(criteria, maxLimit, accessScope);

        return new CountTransactionsQuery.Output(count, capped, maxLimit);
    }
}

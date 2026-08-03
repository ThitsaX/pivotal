import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TransactionRollupRepository} from '../../../../../packages/core/audit/domain/repository/transaction-rollup.repository';

describe('TransactionRollupRepository dashboard projections', () => {

    it('returns committed value grouped by currency and use case', async () => {
        const readRepository = {
            async query(): Promise<Record<string, unknown>[]> {
                return [
                    {currency: 'USD', sub_scenario: 'PERSON_TO_PERSON', total_amount: '12.50', txn_count: '2'},
                ];
            },
        };
        const repository = new TransactionRollupRepository({} as never, readRepository as never);
        const from = new Date('2026-08-01T00:00:00Z');
        const to = new Date('2026-08-02T00:00:00Z');

        assert.deepEqual(await repository.getValueByCurrency(undefined, from, to), [
            {currency: 'USD', useCase: 'PERSON_TO_PERSON', totalAmount: '12.50', txnCount: 2},
        ]);
    });
});

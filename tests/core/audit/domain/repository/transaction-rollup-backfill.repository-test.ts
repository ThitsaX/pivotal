import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TransactionRollupRepository} from '../../../../../packages/core/audit/domain/repository/transaction-rollup.repository';

describe('TransactionRollupRepository backfill state', () => {

    it('reads and clears the migration marker on the primary database', async () => {
        const statements: string[] = [];
        const writeRepository = {
            async query(sql: string): Promise<Record<string, unknown>[]> {
                statements.push(sql);
                return sql.includes('SELECT') ? [{backfill_required: 1}] : [];
            },
        };
        const repository = new TransactionRollupRepository(writeRepository as never, {} as never);

        assert.equal(await repository.isBackfillRequired(), true);
        await repository.markBackfillComplete();
        assert.equal(statements.length, 2);
        assert.match(statements[1], /backfill_required = FALSE/);
    });
});

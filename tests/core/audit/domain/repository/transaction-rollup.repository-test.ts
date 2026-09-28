import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TransactionRollupRepository} from '../../../../../packages/core/audit/domain/repository/transaction-rollup.repository';

describe('TransactionRollupRepository dashboard projections', () => {

    it('returns committed value grouped by use case and FSP amounts separated by currency', async () => {
        const queries: string[] = [];
        const readRepository = {
            async query(sql: string): Promise<Record<string, unknown>[]> {
                queries.push(sql);

                if (sql.includes('SELECT currency,')) {
                    return [
                        {currency: 'USD', sub_scenario: 'PERSON_TO_PERSON', total_amount: '12.50', txn_count: '2'},
                    ];
                }

                return [
                    {fsp_id: 'wallet1', currency: 'USD', count: '3', total_amount: '12.50'},
                    {fsp_id: 'wallet1', currency: 'EUR', count: '2', total_amount: '8.00'},
                    {fsp_id: 'wallet2', currency: 'XXX', count: '4', total_amount: '0'},
                    {fsp_id: 'wallet3', currency: 'USD', count: '1', total_amount: '1.00'},
                ];
            },
        };
        const repository = new TransactionRollupRepository({} as never, readRepository as never);
        const from = new Date('2026-08-01T00:00:00Z');
        const to = new Date('2026-08-02T00:00:00Z');

        assert.deepEqual(await repository.getValueByCurrency(undefined, from, to), [
            {currency: 'USD', useCase: 'PERSON_TO_PERSON', totalAmount: '12.50', txnCount: 2},
        ]);
        assert.deepEqual(await repository.getTopFsps(undefined, 'payer_fsp', from, to, 2), [
            {
                fspId: 'wallet1',
                count: 5,
                amounts: [
                    {currency: 'USD', totalAmount: '12.50'},
                    {currency: 'EUR', totalAmount: '8.00'},
                ],
            },
            {fspId: 'wallet2', count: 4, amounts: []},
        ]);
        assert.ok(queries.every((sql) => sql.includes('FROM transaction_hourly_rollup')));
        assert.ok(queries.every((sql) => !sql.includes('FROM transactions\n')));
    });

    it('reads exact raw boundary intervals around full rollup hours', async () => {
        let capturedSql = '';
        let capturedParams: unknown[] = [];
        const readRepository = {
            async query(sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
                capturedSql = sql;
                capturedParams = params;
                return [];
            },
        };
        const repository = new TransactionRollupRepository({} as never, readRepository as never);
        const from = new Date('2026-08-01T17:30:00.000Z');
        const to = new Date('2026-08-02T17:30:00.000Z');

        await repository.getTimeBuckets('wallet1', from, to);

        assert.match(capturedSql, /FROM transaction_hourly_rollup/);
        assert.equal(capturedSql.match(/FROM transactions\n/g)?.length, 2);
        assert.equal(capturedSql.match(/transaction_started_at >= \? AND transaction_started_at < \?/g)?.length, 2);
        assert.deepEqual(
            capturedParams.filter((value): value is Date => value instanceof Date).map((value) => value.toISOString()),
            [
                '2026-08-01T18:00:00.000Z',
                '2026-08-02T17:00:00.000Z',
                '2026-08-01T17:30:00.000Z',
                '2026-08-01T17:30:00.000Z',
                '2026-08-01T18:00:00.000Z',
                '2026-08-02T17:00:00.000Z',
                '2026-08-02T17:00:00.000Z',
                '2026-08-02T17:30:00.000Z',
            ],
        );
        assert.equal(capturedParams.filter((value) => value === 'wallet1').length, 6);
    });
});

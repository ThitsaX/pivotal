import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {Transaction} from '../../../../../packages/core/audit/domain/model/transaction.model';
import {FindTransactionsQuery} from '../../../../../packages/core/audit/domain/query/find-transactions.query';
import {TransactionRepository} from '../../../../../packages/core/audit/domain/repository/transaction.repository';

class CapturingQueryBuilder {
    readonly where: Array<{sql: string; params?: Record<string, unknown>}> = [];

    select(): this {
        return this;
    }

    andWhere(sql: string, params?: Record<string, unknown>): this {
        this.where.push({sql, params});
        return this;
    }

    orderBy(): this {
        return this;
    }

    addOrderBy(): this {
        return this;
    }

    limit(): this {
        return this;
    }

    async getMany(): Promise<never[]> {
        return [];
    }
}

describe('TransactionRepository', () => {

    it('filters by payer and payee home transaction IDs', async () => {
        const queryBuilder = new CapturingQueryBuilder();
        const readRepository = {
            createQueryBuilder(): CapturingQueryBuilder {
                return queryBuilder;
            },
        };
        const repository = new TransactionRepository({} as never, readRepository as never);
        const criteria = new FindTransactionsQuery.Criteria(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            'payer-home-1',
            'payee-home-1',
        );

        await repository.find(
            criteria,
            new FindTransactionsQuery.Cursor(),
            new FindTransactionsQuery.Order(),
        );

        assert.deepEqual(queryBuilder.where, [
            {
                sql: 'transaction.payerHomeTransactionId = :payerHomeTransactionId',
                params: {payerHomeTransactionId: 'payer-home-1'},
            },
            {
                sql: 'transaction.payeeHomeTransactionId = :payeeHomeTransactionId',
                params: {payeeHomeTransactionId: 'payee-home-1'},
            },
        ]);
    });

    it('should serialize JSON columns before executing raw upsert', async () => {
        const queries: Array<{sql: string; params: unknown[]}> = [];
        const writeRepository = {
            async query(sql: string, params: unknown[]): Promise<Array<{id: string}>> {
                queries.push({sql, params});

                if (sql.startsWith('SELECT id FROM transactions')) {
                    return [{id: 'txn-1'}];
                }

                return [];
            },
        };
        const readRepository = {
            async findOne(): Promise<null> {
                return null;
            },
        };
        const repository = new TransactionRepository(writeRepository as never, readRepository as never);
        const occurredAt = new Date('2026-04-16T15:45:00.000Z');
        const partiesResponse = {
            party: {
                partyIdInfo: {
                    fspId: 'wallet2',
                    partyIdType: 'MSISDN',
                    partyIdentifier: '959123456789',
                },
            },
        };

        const id = await repository.upsert({
            correlationId: 'corr-1',
            payerFsp: 'payerfsp',
            payeeFsp: 'payeefsp',
            transactionStartedAt: occurredAt,
            error: false,
            partiesRespondedAt: occurredAt,
            partiesResponse,
            connectorPartiesRespondedAt: occurredAt,
            createdAt: occurredAt,
        });

        assert.equal(queries.length, 2);
        assert.equal(id, 'txn-1');
        assert.match(queries[0]?.sql ?? '', /INSERT INTO transactions/);
        const columns = /INSERT INTO transactions\s*\(([\s\S]*?)\)\s*VALUES/.exec(queries[0]?.sql ?? '')?.[1]
            .split(',').map((column) => column.trim());
        assert.ok(columns);
        assert.equal(columns[0], 'correlation_id');
        assert.ok(!columns.includes('id'));
        assert.equal(queries[0]?.params[0], 'corr-1');
        assert.match(
            queries[0]?.sql ?? '',
            /WHEN transactions\.payer_id IS NOT NULL AND VALUES\(payer_id\) IS NULL THEN transactions\.payer_fsp/,
        );
        assert.match(
            queries[0]?.sql ?? '',
            /WHEN transactions\.payee_id IS NOT NULL AND VALUES\(payee_id\) IS NULL THEN transactions\.payee_fsp/,
        );
        assert.equal(
            queries[0]?.params[30],
            JSON.stringify(partiesResponse),
        );
    });

    it('saves new entities by correlation ID and preserves database BIGINT IDs exactly', async () => {
        const writeRepository = {
            async query(sql: string): Promise<Array<{id: string}>> {
                return sql.startsWith('SELECT id FROM transactions') ? [{id: '887906513165762561'}] : [];
            },
            async save(): Promise<never> {
                throw new Error('Must not use ORM-generated BIGINT insert IDs');
            },
        };
        const repository = new TransactionRepository(writeRepository as never, {} as never);
        const entity = Object.assign(new Transaction(), {
            correlationId: 'new-transfer',
            payerFsp: 'payer',
            payeeFsp: 'payee',
            transactionStartedAt: new Date('2026-09-15T21:13:29.246Z'),
            error: false,
        });

        assert.equal(await repository.save(entity), entity);
        assert.equal(entity.id, '887906513165762561');
    });

    it('resolves disputes with a direct idempotent update by correlation ID', async () => {
        const queries: Array<{sql: string; params: unknown[]}> = [];
        const writeRepository = {
            async query(sql: string, params: unknown[]): Promise<{affectedRows: number}> {
                queries.push({sql, params});

                return {affectedRows: 1};
            },
        };
        const repository = new TransactionRepository(writeRepository as never, {} as never);
        const occurredAt = new Date('2026-10-07T10:15:30.123Z');

        const resolved = await repository.resolveDispute('transfer-1', occurredAt);

        assert.equal(resolved, true);
        assert.equal(queries.length, 1);
        assert.match(queries[0]?.sql ?? '', /UPDATE transactions/);
        assert.match(queries[0]?.sql ?? '', /possible_dispute = 0/);
        assert.match(queries[0]?.sql ?? '', /dispute_resolved_at = \?/);
        assert.match(queries[0]?.sql ?? '', /WHERE correlation_id = \?/);
        assert.deepEqual(queries[0]?.params, [occurredAt, 'transfer-1']);
    });

    it('reports unresolved when the direct dispute update matches no transaction', async () => {
        const writeRepository = {
            async query(): Promise<{affectedRows: number}> {
                return {affectedRows: 0};
            },
        };
        const repository = new TransactionRepository(writeRepository as never, {} as never);

        const resolved = await repository.resolveDispute('missing-transfer', new Date());

        assert.equal(resolved, false);
    });
});

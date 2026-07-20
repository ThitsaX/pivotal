import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
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

        await repository.upsert({
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
        assert.match(queries[0]?.sql ?? '', /INSERT INTO transactions/);
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
});

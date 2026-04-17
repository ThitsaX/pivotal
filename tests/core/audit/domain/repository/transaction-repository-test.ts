import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TransactionRepository} from '../../../../../packages/core/audit/domain/repository/transaction.repository.ts';

describe('TransactionRepository', () => {

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
        assert.equal(
            queries[0]?.params[26],
            JSON.stringify(partiesResponse),
        );
    });
});

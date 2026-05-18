import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {FindTransactionsQuery} from '../../../../../packages/core/audit/domain/query/find-transactions.query';
import {TransactionRepository} from '../../../../../packages/core/audit/domain/repository/transaction.repository';
import {PartyIdType} from '../../../../../packages/shared/fspiop';

type FakeQueryBuilder = {
    andWhere(condition?: string, parameters?: Record<string, unknown>): FakeQueryBuilder;
    orderBy(): FakeQueryBuilder;
    skip(): FakeQueryBuilder;
    take(): FakeQueryBuilder;
    getManyAndCount(): Promise<[unknown[], number]>;
};

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

    it('should backfill payer and payee display fields from audited payloads', async () => {
        const record = {
            id: 'txn-2',
            correlationId: 'corr-2',
            payerFsp: '',
            payeeFsp: '',
            payerIdType: null,
            payerId: null,
            payerSubId: null,
            payeeIdType: null,
            payeeId: null,
            payeeSubId: null,
            quotesRequest: {
                payer: {
                    partyIdInfo: {
                        fspId: 'wallet1',
                        partyIdType: PartyIdType.Msisdn,
                        partyIdentifier: '959250000001',
                    },
                },
                payee: {
                    partyIdInfo: {
                        fspId: 'wallet2',
                        partyIdType: PartyIdType.Msisdn,
                        partyIdentifier: '959420000111',
                    },
                },
                amount: {currency: 'USD', amount: '10'},
            },
            partiesRequest: {
                partyIdType: PartyIdType.Msisdn,
                partyId: '959420000111',
                subId: null,
            },
            partiesResponse: {
                party: {
                    partyIdInfo: {
                        fspId: 'wallet2',
                        partyIdType: PartyIdType.Msisdn,
                        partyIdentifier: '959420000111',
                    },
                },
            },
        };
        const queryBuilder: FakeQueryBuilder = {
            andWhere(): FakeQueryBuilder {
                return this;
            },
            orderBy(): FakeQueryBuilder {
                return this;
            },
            skip(): FakeQueryBuilder {
                return this;
            },
            take(): FakeQueryBuilder {
                return this;
            },
            async getManyAndCount(): Promise<[unknown[], number]> {
                return [[record], 1];
            },
        };
        const readRepository = {
            createQueryBuilder(): FakeQueryBuilder {
                return queryBuilder;
            },
        };
        const writeRepository = {
            async query(): Promise<unknown[]> {
                return [];
            },
        };
        const repository = new TransactionRepository(writeRepository as never, readRepository as never);
        const output = await repository.find(
            new FindTransactionsQuery.Criteria(),
            new FindTransactionsQuery.PageRequest(0, 20),
            new FindTransactionsQuery.Order(),
        );

        assert.equal(output.records[0]?.payerFsp, 'wallet1');
        assert.equal(output.records[0]?.payerIdType, PartyIdType.Msisdn);
        assert.equal(output.records[0]?.payerId, '959250000001');
        assert.equal(output.records[0]?.payeeFsp, 'wallet2');
        assert.equal(output.records[0]?.payeeIdType, PartyIdType.Msisdn);
        assert.equal(output.records[0]?.payeeId, '959420000111');
    });

    it('should expose transfer ID separately from trace correlation ID', async () => {
        const conditions: string[] = [];
        const parameters: Record<string, unknown>[] = [];
        const record = {
            id: 'txn-4',
            correlationId: '00-00000000000000000000000000000000-0123456789abcdef-30',
            payerFsp: 'wallet1',
            payeeFsp: 'wallet2',
            payerIdType: null,
            payerId: null,
            payerSubId: null,
            payeeIdType: null,
            payeeId: null,
            payeeSubId: null,
            transfersRequest: {
                transferId: '01KRWKMAW9EJABC77X568DYFT4',
                payerFsp: 'wallet1',
                payeeFsp: 'wallet2',
                amount: {currency: 'USD', amount: '10'},
            },
        };
        const queryBuilder: FakeQueryBuilder = {
            andWhere(condition?: string, params?: Record<string, unknown>): FakeQueryBuilder {
                if (condition != null) {
                    conditions.push(condition);
                }
                if (params != null) {
                    parameters.push(params);
                }

                return this;
            },
            orderBy(): FakeQueryBuilder {
                return this;
            },
            skip(): FakeQueryBuilder {
                return this;
            },
            take(): FakeQueryBuilder {
                return this;
            },
            async getManyAndCount(): Promise<[unknown[], number]> {
                return [[record], 1];
            },
        };
        const readRepository = {
            createQueryBuilder(): FakeQueryBuilder {
                return queryBuilder;
            },
        };
        const writeRepository = {
            async query(): Promise<unknown[]> {
                return [];
            },
        };
        const repository = new TransactionRepository(writeRepository as never, readRepository as never);
        const output = await repository.find(
            new FindTransactionsQuery.Criteria(
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                '01KRWKMAW9EJABC77X568DYFT4',
            ),
            new FindTransactionsQuery.PageRequest(0, 20),
            new FindTransactionsQuery.Order(),
        );

        assert.equal(output.records[0]?.transferId, '01KRWKMAW9EJABC77X568DYFT4');
        assert.equal(output.records[0]?.correlationId, '00-00000000000000000000000000000000-0123456789abcdef-30');
        assert.match(conditions.join('\n'), /JSON_EXTRACT\(transaction\.transfersRequest, '\$\.transferId'\)/);
        assert.deepEqual(parameters.at(-1), {transferId: '01KRWKMAW9EJABC77X568DYFT4'});
    });

    it('should parse JSON detail payloads returned as strings', async () => {
        const partiesRequest = {
            partyIdType: PartyIdType.Msisdn,
            partyId: '959420000111',
            subId: null,
        };
        const quotesRequest = {
            payer: {
                partyIdInfo: {
                    fspId: 'wallet1',
                    partyIdType: PartyIdType.Msisdn,
                    partyIdentifier: '959250000001',
                },
            },
            payee: {
                partyIdInfo: {
                    fspId: 'wallet2',
                    partyIdType: PartyIdType.Msisdn,
                    partyIdentifier: '959420000111',
                },
            },
        };
        const readRepository = {
            async findOne(): Promise<unknown> {
                return {
                    id: 'txn-3',
                    correlationId: 'corr-3',
                    payerFsp: '',
                    payeeFsp: '',
                    payerIdType: null,
                    payerId: null,
                    payerSubId: null,
                    payeeIdType: null,
                    payeeId: null,
                    payeeSubId: null,
                    partiesRequest: JSON.stringify(partiesRequest),
                    quotesRequest: JSON.stringify(quotesRequest),
                };
            },
        };
        const writeRepository = {
            async query(): Promise<unknown[]> {
                return [];
            },
        };
        const repository = new TransactionRepository(writeRepository as never, readRepository as never);
        const detail = await repository.get('corr-3');

        assert.deepEqual(detail?.partiesRequest, partiesRequest);
        assert.deepEqual(detail?.quotesRequest, quotesRequest);
        assert.equal(detail?.transferId, 'corr-3');
        assert.equal(detail?.payerFsp, 'wallet1');
        assert.equal(detail?.payerId, '959250000001');
        assert.equal(detail?.payeeFsp, 'wallet2');
        assert.equal(detail?.payeeId, '959420000111');
    });
});

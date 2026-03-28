import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TransactionMessage} from '../../../../../packages/core/audit/common/index.ts';
import {AuditPartiesRequestCommand} from '../../../../../packages/core/audit/domain/command/parties/audit-parties-request.command.ts';
import {AuditPartiesRequestHandler} from '../../../../../packages/core/audit/domain/command/parties/audit-parties-request.handler.ts';
import {AuditQuotesResponseCommand} from '../../../../../packages/core/audit/domain/command/quotes/audit-quotes-response.command.ts';
import {AuditQuotesResponseHandler} from '../../../../../packages/core/audit/domain/command/quotes/audit-quotes-response.handler.ts';
import {AuditTransfersErrorCommand} from '../../../../../packages/core/audit/domain/command/transfers/audit-transfers-error.command.ts';
import {AuditTransfersErrorHandler} from '../../../../../packages/core/audit/domain/command/transfers/audit-transfers-error.handler.ts';
import {DisputeTransactionCommand} from '../../../../../packages/core/audit/domain/command/transaction/dispute-transaction.command.ts';
import {DisputeTransactionHandler} from '../../../../../packages/core/audit/domain/command/transaction/dispute-transaction.handler.ts';
import {PartyIdType, QuotesPostRequest, TransactionInitiatorType} from '../../../../../packages/shared/fspiop';

function createTransactionRepositoryStub() {
    let upsertInput: unknown = null;
    let disputedCorrelationId: string | null = null;

    return {
        repository: {
            async upsert(input: unknown): Promise<string> {
                upsertInput = input;

                return 'txn-1';
            },
            async dispute(correlationId: string): Promise<{id: string} | null> {
                disputedCorrelationId = correlationId;

                if (correlationId === 'missing') {
                    return null;
                }

                return {id: 'txn-1'};
            },
        },
        get upsertInput(): unknown {
            return upsertInput;
        },
        get disputedCorrelationId(): string | null {
            return disputedCorrelationId;
        },
    };
}

describe('Audit transaction handlers', () => {

    it('should project parties request payload into outbound transaction timestamps', async () => {
        const repository = createTransactionRepositoryStub();
        const handler = new AuditPartiesRequestHandler(repository.repository as never);
        const occurredAt = new Date('2026-02-01T00:00:00.000Z');

        await handler.execute(new AuditPartiesRequestCommand(
            new AuditPartiesRequestCommand.Input(
                'corr-1',
                'payerfsp',
                'payeefsp',
                PartyIdType.Msisdn,
                '959250000001',
                'wallet-1',
                PartyIdType.Msisdn,
                '959420000111',
                null,
                TransactionInitiatorType.Consumer,
                'TRANSFER' as never,
                'SUB',
                TransactionMessage.InvocationGateway.Outbound,
                {partyIdType: PartyIdType.Msisdn, partyId: '959420000111'},
                occurredAt,
            ),
        ));

        assert.deepEqual(repository.upsertInput, {
            correlationId: 'corr-1',
            payerFsp: 'payerfsp',
            payeeFsp: 'payeefsp',
            payerIdType: PartyIdType.Msisdn,
            payerId: '959250000001',
            payerSubId: 'wallet-1',
            payeeIdType: PartyIdType.Msisdn,
            payeeId: '959420000111',
            payeeSubId: null,
            transactionStartedAt: occurredAt,
            transactionInitiatorType: TransactionInitiatorType.Consumer,
            transactionType: 'TRANSFER',
            subScenario: 'SUB',
            error: false,
            partiesRequestedAt: occurredAt,
            partiesRequest: {partyIdType: PartyIdType.Msisdn, partyId: '959420000111'},
            createdAt: occurredAt,
            outboundPartiesRequestedAt: occurredAt,
        });
    });

    it('should project quotes response payload into inbound transaction timestamps', async () => {
        const repository = createTransactionRepositoryStub();
        const handler = new AuditQuotesResponseHandler(repository.repository as never);
        const occurredAt = new Date('2026-02-01T00:00:05.000Z');
        const request = {
            amount: {amount: '10', currency: 'USD'},
            payer: {partyIdInfo: {partyIdType: PartyIdType.Msisdn, partyIdentifier: '959250000001'}},
            payee: {partyIdInfo: {partyIdType: PartyIdType.Msisdn, partyIdentifier: '959420000111'}},
            transactionType: {scenario: 'TRANSFER', subScenario: 'SUB'},
        } as unknown as QuotesPostRequest;
        const response = {transferAmount: {amount: '12', currency: 'USD'}} as const;

        await handler.execute(new AuditQuotesResponseCommand(
            new AuditQuotesResponseCommand.Input(
                'corr-2',
                'payerfsp',
                'payeefsp',
                TransactionMessage.InvocationGateway.Inbound,
                request,
                response,
                occurredAt,
            ),
        ));

        assert.deepEqual(repository.upsertInput, {
            correlationId: 'corr-2',
            payerFsp: 'payerfsp',
            payeeFsp: 'payeefsp',
            payerIdType: PartyIdType.Msisdn,
            payerId: '959250000001',
            payerSubId: null,
            payeeIdType: PartyIdType.Msisdn,
            payeeId: '959420000111',
            payeeSubId: null,
            transactionInitiatorType: null,
            quotingCurrency: 'USD',
            quotingAmount: 10,
            transferCurrency: 'USD',
            transferAmount: 12,
            transactionStartedAt: occurredAt,
            transactionType: 'TRANSFER',
            subScenario: 'SUB',
            error: false,
            quotesRespondedAt: occurredAt,
            quotesRequest: request,
            quotesResponse: response,
            createdAt: occurredAt,
            inboundQuotesRespondedAt: occurredAt,
        });
    });

    it('should project transfers error payload into connector transaction timestamps', async () => {
        const repository = createTransactionRepositoryStub();
        const handler = new AuditTransfersErrorHandler(repository.repository as never);
        const occurredAt = new Date('2026-02-01T00:00:09.000Z');
        const request = {transferId: 'tx-1', payerFsp: 'payerfsp', payeeFsp: 'payeefsp', amount: {amount: '12', currency: 'USD'}} as const;
        const error = {errorInformation: {errorCode: '3200'}} as const;

        await handler.execute(new AuditTransfersErrorCommand(
            new AuditTransfersErrorCommand.Input(
                'corr-3',
                'payerfsp',
                'payeefsp',
                TransactionMessage.InvocationGateway.Connector,
                request,
                error,
                occurredAt,
            ),
        ));

        assert.deepEqual(repository.upsertInput, {
            correlationId: 'corr-3',
            payerFsp: 'payerfsp',
            payeeFsp: 'payeefsp',
            transferCurrency: 'USD',
            transferAmount: 12,
            transactionStartedAt: occurredAt,
            transactionCompletedAt: occurredAt,
            error: true,
            transfersRespondedAt: occurredAt,
            transfersRequest: request,
            transfersError: error,
            createdAt: occurredAt,
            connectorTransfersRespondedAt: occurredAt,
        });
    });

    it('should mark a transaction as disputed', async () => {
        const repository = createTransactionRepositoryStub();
        const handler = new DisputeTransactionHandler(repository.repository as never);

        const output = await handler.execute(
            new DisputeTransactionCommand(new DisputeTransactionCommand.Input('corr-5')),
        );

        assert.equal(repository.disputedCorrelationId, 'corr-5');
        assert.equal(output.id, 'txn-1');
    });

    it('should fail when disputing a missing transaction', async () => {
        const repository = createTransactionRepositoryStub();
        const handler = new DisputeTransactionHandler(repository.repository as never);

        await assert.rejects(
            handler.execute(new DisputeTransactionCommand(new DisputeTransactionCommand.Input('missing'))),
        );
    });
});

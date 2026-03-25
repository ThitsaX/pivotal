import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    AuditInboundPartiesCommand,
    AuditInboundPartiesHandler,
    AuditInboundQuotesCommand,
    AuditInboundQuotesHandler,
    AuditInboundTransfersCommand,
    AuditInboundTransfersHandler,
    AuditOutboundPartiesCommand,
    AuditOutboundPartiesHandler,
    AuditOutboundQuotesCommand,
    AuditOutboundQuotesHandler,
    AuditOutboundTransfersCommand,
    AuditOutboundTransfersHandler,
} from '../../../../../packages/core/audit/domain/command';
import {
    InboundParties,
    InboundQuotes,
    InboundTransfers,
    OutboundParties,
    OutboundQuotes,
    OutboundTransfers,
} from '../../../../../packages/core/audit/domain/model';
import {DbTarget} from '../../../../../packages/shared/typeorm';
import {
    ErrorInformationObject,
    PartiesTypeIDPutResponse,
    PartyIdType,
    QuotesIDPutResponse,
    QuotesPostRequest,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '../../../../../packages/shared/fspiop';

describe('Audit*Handler correlationId merge', () => {

    it('should merge inbound parties with an existing record', async () => {
        const correlationId = 'corr-inbound-party';
        const createdAt = new Date('2026-01-01T00:00:00.000Z');
        const existing = new InboundParties(
            'existing-id',
            correlationId,
            'mojaloop',
            'payerfsp',
            'payeefsp',
            PartyIdType.Msisdn,
            '959123456789',
            'sub-1',
            null,
            {errorInformation: {errorCode: '3100'}} as ErrorInformationObject,
            'fsp failed',
            true,
            createdAt,
            null,
        );
        const response = {party: {partyIdInfo: {partyIdType: PartyIdType.Msisdn}}} as PartiesTypeIDPutResponse;
        let findTarget: DbTarget | null = null;
        let saved: InboundParties | null = null;

        const handler = new AuditInboundPartiesHandler({
            async findByCorrelationId(value: string, target: DbTarget): Promise<InboundParties | null> {
                assert.equal(value, correlationId);
                findTarget = target;

                return existing;
            },
            async save(entity: InboundParties): Promise<InboundParties> {
                saved = entity;

                return entity;
            },
        } as unknown as never);

        const output = await handler.execute(new AuditInboundPartiesCommand(
            new AuditInboundPartiesCommand.Input(
                'new-id',
                correlationId,
                'mojaloop',
                'payerfsp',
                'payeefsp',
                PartyIdType.Msisdn,
                '959123456789',
                undefined,
                response,
                null,
                null,
                new Date('2026-02-01T00:00:00.000Z'),
                undefined,
            ),
        ));

        assert.equal(findTarget, DbTarget.Write);
        assert.equal(output.id, 'existing-id');
        assert.ok(saved);
        const savedEntity = saved as InboundParties;

        assert.equal(savedEntity.id, 'existing-id');
        assert.equal(savedEntity.subId, 'sub-1');
        assert.equal(savedEntity.response, response);
        assert.equal(savedEntity.error, null);
        assert.equal(savedEntity.fspError, null);
        assert.equal(savedEntity.failed, false);
        assert.equal(savedEntity.createdAt.getTime(), createdAt.getTime());
        assert.ok(savedEntity.completedAt instanceof Date);
    });

    it('should merge inbound quotes with an existing record', async () => {
        const correlationId = 'corr-inbound-quote';
        const request = {
            transactionType: {
                scenario: 'TRANSFER',
                subScenario: 'SUB',
            },
            amount: {
                amount: '10',
                currency: 'USD',
            },
        } as QuotesPostRequest;
        const existing = new InboundQuotes(
            'existing-id',
            correlationId,
            'mojaloop',
            'payerfsp',
            'payeefsp',
            'quote-1',
            request,
            null,
            {errorInformation: {errorCode: '3200'}} as ErrorInformationObject,
            'fsp failed',
            true,
            new Date('2026-01-01T00:00:00.000Z'),
            null,
        );
        const response = {transferAmount: {amount: '10', currency: 'USD'}} as QuotesIDPutResponse;
        let findTarget: DbTarget | null = null;
        let saved: InboundQuotes | null = null;

        const handler = new AuditInboundQuotesHandler({
            async findByCorrelationId(value: string, target: DbTarget): Promise<InboundQuotes | null> {
                assert.equal(value, correlationId);
                findTarget = target;

                return existing;
            },
            async save(entity: InboundQuotes): Promise<InboundQuotes> {
                saved = entity;

                return entity;
            },
        } as unknown as never);

        const output = await handler.execute(new AuditInboundQuotesCommand(
            new AuditInboundQuotesCommand.Input(
                'new-id',
                correlationId,
                'mojaloop',
                'payerfsp',
                'payeefsp',
                'quote-1',
                request,
                response,
                null,
                null,
                new Date('2026-02-01T00:00:00.000Z'),
                undefined,
            ),
        ));

        assert.equal(findTarget, DbTarget.Write);
        assert.equal(output.id, 'existing-id');
        assert.ok(saved);
        const savedEntity = saved as InboundQuotes;

        assert.equal(savedEntity.id, 'existing-id');
        assert.equal(savedEntity.response, response);
        assert.equal(savedEntity.error, null);
        assert.equal(savedEntity.fspError, null);
        assert.equal(savedEntity.failed, false);
        assert.equal(savedEntity.createdAt.getTime(), existing.createdAt.getTime());
        assert.ok(savedEntity.completedAt instanceof Date);
    });

    it('should merge inbound transfers with an existing record', async () => {
        const correlationId = 'corr-inbound-transfer';
        const request = {
            transferId: 'transfer-1',
            amount: {
                amount: '10',
                currency: 'USD',
            },
        } as TransfersPostRequest;
        const existing = new InboundTransfers(
            'existing-id',
            correlationId,
            'mojaloop',
            'payerfsp',
            'payeefsp',
            'transfer-1',
            request,
            null,
            {errorInformation: {errorCode: '3300'}} as ErrorInformationObject,
            'fsp failed',
            true,
            new Date('2026-01-01T00:00:00.000Z'),
            null,
        );
        const response = {transferState: 'COMMITTED'} as TransfersIDPutResponse;
        let findTarget: DbTarget | null = null;
        let saved: InboundTransfers | null = null;

        const handler = new AuditInboundTransfersHandler({
            async findByCorrelationId(value: string, target: DbTarget): Promise<InboundTransfers | null> {
                assert.equal(value, correlationId);
                findTarget = target;

                return existing;
            },
            async save(entity: InboundTransfers): Promise<InboundTransfers> {
                saved = entity;

                return entity;
            },
        } as unknown as never);

        const output = await handler.execute(new AuditInboundTransfersCommand(
            new AuditInboundTransfersCommand.Input(
                'new-id',
                correlationId,
                'mojaloop',
                'payerfsp',
                'payeefsp',
                'transfer-1',
                request,
                response,
                null,
                null,
                new Date('2026-02-01T00:00:00.000Z'),
                undefined,
            ),
        ));

        assert.equal(findTarget, DbTarget.Write);
        assert.equal(output.id, 'existing-id');
        assert.ok(saved);
        const savedEntity = saved as InboundTransfers;

        assert.equal(savedEntity.id, 'existing-id');
        assert.equal(savedEntity.response, response);
        assert.equal(savedEntity.error, null);
        assert.equal(savedEntity.fspError, null);
        assert.equal(savedEntity.failed, false);
        assert.equal(savedEntity.createdAt.getTime(), existing.createdAt.getTime());
        assert.ok(savedEntity.completedAt instanceof Date);
    });

    it('should merge outbound parties with an existing record', async () => {
        const correlationId = 'corr-outbound-party';
        const createdAt = new Date('2026-01-01T00:00:00.000Z');
        const existing = new OutboundParties(
            'existing-id',
            correlationId,
            'mojaloop',
            'payerfsp',
            'payeefsp',
            PartyIdType.Msisdn,
            '959123456789',
            'sub-1',
            null,
            {errorInformation: {errorCode: '3400'}} as ErrorInformationObject,
            true,
            createdAt,
            null,
        );
        const response = {party: {partyIdInfo: {partyIdType: PartyIdType.Msisdn}}} as PartiesTypeIDPutResponse;
        let findTarget: DbTarget | null = null;
        let saved: OutboundParties | null = null;

        const handler = new AuditOutboundPartiesHandler({
            async findByCorrelationId(value: string, target: DbTarget): Promise<OutboundParties | null> {
                assert.equal(value, correlationId);
                findTarget = target;

                return existing;
            },
            async save(entity: OutboundParties): Promise<OutboundParties> {
                saved = entity;

                return entity;
            },
        } as unknown as never);

        const output = await handler.execute(new AuditOutboundPartiesCommand(
            new AuditOutboundPartiesCommand.Input(
                'new-id',
                correlationId,
                'mojaloop',
                'payerfsp',
                'payeefsp',
                PartyIdType.Msisdn,
                '959123456789',
                undefined,
                response,
                null,
                new Date('2026-02-01T00:00:00.000Z'),
                undefined,
            ),
        ));

        assert.equal(findTarget, DbTarget.Write);
        assert.equal(output.id, 'existing-id');
        assert.ok(saved);
        const savedEntity = saved as OutboundParties;

        assert.equal(savedEntity.id, 'existing-id');
        assert.equal(savedEntity.subId, 'sub-1');
        assert.equal(savedEntity.response, response);
        assert.equal(savedEntity.error, null);
        assert.equal(savedEntity.failed, false);
        assert.equal(savedEntity.createdAt.getTime(), createdAt.getTime());
        assert.ok(savedEntity.completedAt instanceof Date);
    });

    it('should merge outbound quotes with an existing record', async () => {
        const correlationId = 'corr-outbound-quote';
        const request = {
            transactionType: {
                scenario: 'TRANSFER',
                subScenario: 'SUB',
            },
            amount: {
                amount: '10',
                currency: 'USD',
            },
        } as QuotesPostRequest;
        const existing = new OutboundQuotes(
            'existing-id',
            correlationId,
            'mojaloop',
            'payerfsp',
            'payeefsp',
            'quote-1',
            request,
            null,
            {errorInformation: {errorCode: '3500'}} as ErrorInformationObject,
            true,
            new Date('2026-01-01T00:00:00.000Z'),
            null,
        );
        const response = {transferAmount: {amount: '10', currency: 'USD'}} as QuotesIDPutResponse;
        let findTarget: DbTarget | null = null;
        let saved: OutboundQuotes | null = null;

        const handler = new AuditOutboundQuotesHandler({
            async findByCorrelationId(value: string, target: DbTarget): Promise<OutboundQuotes | null> {
                assert.equal(value, correlationId);
                findTarget = target;

                return existing;
            },
            async save(entity: OutboundQuotes): Promise<OutboundQuotes> {
                saved = entity;

                return entity;
            },
        } as unknown as never);

        const output = await handler.execute(new AuditOutboundQuotesCommand(
            new AuditOutboundQuotesCommand.Input(
                'new-id',
                correlationId,
                'mojaloop',
                'payerfsp',
                'payeefsp',
                'quote-1',
                request,
                response,
                null,
                new Date('2026-02-01T00:00:00.000Z'),
                undefined,
            ),
        ));

        assert.equal(findTarget, DbTarget.Write);
        assert.equal(output.id, 'existing-id');
        assert.ok(saved);
        const savedEntity = saved as OutboundQuotes;

        assert.equal(savedEntity.id, 'existing-id');
        assert.equal(savedEntity.response, response);
        assert.equal(savedEntity.error, null);
        assert.equal(savedEntity.failed, false);
        assert.equal(savedEntity.createdAt.getTime(), existing.createdAt.getTime());
        assert.ok(savedEntity.completedAt instanceof Date);
    });

    it('should merge outbound transfers with an existing record', async () => {
        const correlationId = 'corr-outbound-transfer';
        const request = {
            transferId: 'transfer-1',
            amount: {
                amount: '10',
                currency: 'USD',
            },
        } as TransfersPostRequest;
        const existing = new OutboundTransfers(
            'existing-id',
            correlationId,
            'mojaloop',
            'payerfsp',
            'payeefsp',
            'transfer-1',
            request,
            null,
            {errorInformation: {errorCode: '3600'}} as ErrorInformationObject,
            true,
            new Date('2026-01-01T00:00:00.000Z'),
            null,
        );
        const response = {transferState: 'COMMITTED'} as TransfersIDPutResponse;
        let findTarget: DbTarget | null = null;
        let saved: OutboundTransfers | null = null;

        const handler = new AuditOutboundTransfersHandler({
            async findByCorrelationId(value: string, target: DbTarget): Promise<OutboundTransfers | null> {
                assert.equal(value, correlationId);
                findTarget = target;

                return existing;
            },
            async save(entity: OutboundTransfers): Promise<OutboundTransfers> {
                saved = entity;

                return entity;
            },
        } as unknown as never);

        const output = await handler.execute(new AuditOutboundTransfersCommand(
            new AuditOutboundTransfersCommand.Input(
                'new-id',
                correlationId,
                'mojaloop',
                'payerfsp',
                'payeefsp',
                'transfer-1',
                request,
                response,
                null,
                new Date('2026-02-01T00:00:00.000Z'),
                undefined,
            ),
        ));

        assert.equal(findTarget, DbTarget.Write);
        assert.equal(output.id, 'existing-id');
        assert.ok(saved);
        const savedEntity = saved as OutboundTransfers;

        assert.equal(savedEntity.id, 'existing-id');
        assert.equal(savedEntity.response, response);
        assert.equal(savedEntity.error, null);
        assert.equal(savedEntity.failed, false);
        assert.equal(savedEntity.createdAt.getTime(), existing.createdAt.getTime());
        assert.ok(savedEntity.completedAt instanceof Date);
    });
});

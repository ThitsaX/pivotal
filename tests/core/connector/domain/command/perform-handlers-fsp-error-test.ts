import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TransactionMessage} from '../../../../../packages/core/audit/common/index.ts';
import {AuditTransactionPublisher} from '../../../../../packages/core/audit/producer';
import {
    PerformGetPartiesCommand,
    PerformGetPartiesHandler,
    PerformPostQuotesCommand,
    PerformPostQuotesHandler,
    PerformPostTransfersCommand,
    PerformPostTransfersHandler,
} from '../../../../../packages/core/connector/domain/command';
import {ConnectorSettings, FspClientException} from '../../../../../packages/core/connector/domain';
import {FspConnector} from '../../../../../packages/core/connector/domain/component';
import {FspiopAxios, FspiopException, PartyIdType, QuotesPostRequest, TransfersPostRequest} from '../../../../../packages/shared/fspiop';

type PublishedMessage = TransactionMessage<{error?: unknown}>;

describe('Perform*Handler fspError audit mapping', () => {

    it('should publish fspError for getParties failures', async () => {
        let published: PublishedMessage | null = null;

        const handler = new PerformGetPartiesHandler(
            {
                async getParties(): Promise<never> {
                    throw new FspClientException('party lookup failed');
                },
            } as unknown as FspConnector,
            {
                connectorId: 'dfsp-connector',
            } as ConnectorSettings,
            {
                settings: {partiesUrl: 'http://parties.test'},
                async putPartiesError(): Promise<void> {
                },
            } as unknown as FspiopAxios,
            {
                async publish(input: PublishedMessage): Promise<void> {
                    published = input;
                },
            } as unknown as AuditTransactionPublisher,
        );

        await assert.rejects(
            handler.execute(new PerformGetPartiesCommand(
                new PerformGetPartiesCommand.Input('payerfsp', 'payeefsp', PartyIdType.Msisdn, '959123456789', null),
            )),
            (error: unknown) => error instanceof FspiopException && error.message === 'party lookup failed',
        );

        assert.ok(published);
        const publishedInput = published?.content as {error?: {fspError?: string} | null};

        assert.equal((publishedInput.error as {fspError?: string}).fspError, 'party lookup failed');
    });

    it('should publish original fspError for quote failures even if callback fails later', async () => {
        let published: PublishedMessage | null = null;

        const request = {quoteId: 'quote-1'} as QuotesPostRequest;
        const handler = new PerformPostQuotesHandler(
            {
                async postQuotes(): Promise<never> {
                    throw new FspClientException('quote calculation failed');
                },
            } as unknown as FspConnector,
            {
                connectorId: 'dfsp-connector',
            } as ConnectorSettings,
            {
                settings: {quotesUrl: 'http://quotes.test'},
                async putQuotesError(): Promise<never> {
                    throw new Error('callback failed');
                },
            } as unknown as FspiopAxios,
            {
                async publish(input: PublishedMessage): Promise<void> {
                    published = input;
                },
            } as unknown as AuditTransactionPublisher,
        );

        await assert.rejects(
            handler.execute(new PerformPostQuotesCommand(
                new PerformPostQuotesCommand.Input('payerfsp', 'payeefsp', request),
            )),
            (error: unknown) => error instanceof FspiopException && error.message === 'callback failed',
        );

        assert.ok(published);
        const publishedInput = published?.content as {error?: {fspError?: string; audit?: unknown} | null};

        assert.equal((publishedInput.error as {fspError?: string}).fspError, 'quote calculation failed');
        assert.equal(
            ((publishedInput.error as {audit?: {errorInformation?: {errorDescription?: string}}}).audit)
                ?.errorInformation?.errorDescription,
            'callback failed',
        );
    });

    it('should publish fspError for transfer failures', async () => {
        let published: PublishedMessage | null = null;

        const request = {transferId: 'transfer-1'} as TransfersPostRequest;
        const handler = new PerformPostTransfersHandler(
            {
                async postTransfers(): Promise<never> {
                    throw new FspClientException('transfer execution failed');
                },
            } as unknown as FspConnector,
            {
                connectorId: 'dfsp-connector',
            } as ConnectorSettings,
            {
                settings: {transfersUrl: 'http://transfers.test'},
                async putTransfersError(): Promise<void> {
                },
            } as unknown as FspiopAxios,
            {
                async publish(input: PublishedMessage): Promise<void> {
                    published = input;
                },
            } as unknown as AuditTransactionPublisher,
        );

        await assert.rejects(
            handler.execute(new PerformPostTransfersCommand(
                new PerformPostTransfersCommand.Input('payerfsp', 'payeefsp', request),
            )),
            (error: unknown) => error instanceof FspiopException && error.message === 'transfer execution failed',
        );

        assert.ok(published);
        const publishedInput = published?.content as {error?: {fspError?: string} | null};

        assert.equal((publishedInput.error as {fspError?: string}).fspError, 'transfer execution failed');
    });
});

import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TransactionMessage} from '../../../../../packages/core/audit/common';
import {TransferRequest} from '../../../../../packages/core/outbound/domain/cache';
import {PutAcceptQuoteCommand} from '../../../../../packages/core/outbound/domain/command/put-accept-quote.command';
import {PutAcceptQuoteHandler} from '../../../../../packages/core/outbound/domain/command/put-accept-quote.handler';
import {
    AmountType,
    Currency,
    FspiopErrors,
    FspiopException,
    Money,
    Party,
    PartyIdInfo,
    PartyIdType,
    QuotesIDPutResponse,
    TransactionInitiatorType,
    TransactionScenario,
    TransferState,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '../../../../../packages/shared/fspiop';

function party(fspId: string, id: string): Party {
    const partyIdInfo = new PartyIdInfo();
    partyIdInfo.fspId = fspId;
    partyIdInfo.partyIdType = PartyIdType.Msisdn;
    partyIdInfo.partyIdentifier = id;

    const value = new Party();
    value.partyIdInfo = partyIdInfo;

    return value;
}

function transferRequest(): TransferRequest {
    const request = new TransferRequest();
    request.payer = party('wallet1', '2769100001');
    request.payee = party('wallet2', '2769200001');
    request.transferId = 'transfer-1';
    request.homeTransactionId = 'payer-home-initial';
    request.initiatedTimestamp = '2026-08-24T00:00:00.000Z';
    request.from = {
        type: TransactionInitiatorType.Consumer,
        idType: PartyIdType.Msisdn,
        idValue: '2769100001',
        fspId: 'wallet1',
    };
    request.to = {
        type: TransactionInitiatorType.Consumer,
        idType: PartyIdType.Msisdn,
        idValue: '2769200001',
        fspId: 'wallet2',
    };
    request.amountType = AmountType.Send;
    request.currency = Currency.Usd;
    request.amount = '10';
    request.transactionType = TransactionScenario.Transfer;
    request.subScenario = 'PERSON_TO_PERSON';

    const transferAmount = new Money();
    transferAmount.amount = '10';
    transferAmount.currency = Currency.Usd;

    const quotes = new QuotesIDPutResponse();
    quotes.transferAmount = transferAmount;
    quotes.payeeReceiveAmount = transferAmount;
    quotes.expiration = '2026-08-24T00:01:00.000Z';
    quotes.ilpPacket = 'ilp-packet';
    quotes.condition = 'condition';
    quotes.extensionList = {
        extension: [
            {key: 'payerFee', value: '1'},
            {key: 'homeTransactionId', value: 'payer-home-stale'},
        ],
    };
    request.quotes = quotes;

    return request;
}

function successfulCallback(): TransfersIDPutResponse {
    const callback = new TransfersIDPutResponse();
    callback.transferState = TransferState.Committed;

    return callback;
}

function createHandler(cachedRequest: TransferRequest) {
    let postedTransfer: TransfersPostRequest | undefined;
    let savedRequest: TransferRequest | undefined;
    let deleted = false;
    const publishedMessages: TransactionMessage[] = [];

    const handler = new PutAcceptQuoteHandler(
        {
            settings: {transfersUrl: 'http://transfers'},
            async postTransfers(
                _url: string,
                _headers: unknown,
                request: TransfersPostRequest,
            ): Promise<void> {
                postedTransfer = request;
            },
        } as never,
        {
            async waitFor(): Promise<TransfersIDPutResponse> {
                return successfulCallback();
            },
            cancel(): void {
            },
        } as never,
        {
            async acquireLock(): Promise<string> {
                return 'lock-token';
            },
            async releaseLock(): Promise<void> {
            },
            async get(): Promise<TransferRequest> {
                return cachedRequest;
            },
            async set(_key: string, value: TransferRequest): Promise<void> {
                savedRequest = value;
            },
            async delete(): Promise<void> {
                deleted = true;
            },
        } as never,
        {
            async publish(message: TransactionMessage): Promise<void> {
                publishedMessages.push(message);
            },
        } as never,
        {
            validate(): void {
            },
        } as never,
    );

    return {
        handler,
        get postedTransfer(): TransfersPostRequest | undefined {
            return postedTransfer;
        },
        get savedRequest(): TransferRequest | undefined {
            return savedRequest;
        },
        get deleted(): boolean {
            return deleted;
        },
        publishedMessages,
    };
}

describe('PutAcceptQuoteHandler', () => {

    it('overwrites the payer home transaction ID when the third call supplies one', async () => {
        const cachedRequest = transferRequest();
        const fixture = createHandler(cachedRequest);

        const output = await fixture.handler.execute(
            new PutAcceptQuoteCommand(
                new PutAcceptQuoteCommand.Input(
                    'transfer-1',
                    true,
                    'wallet1',
                    'payer-home-final',
                ),
            ),
        );

        assert.equal(fixture.savedRequest?.homeTransactionId, 'payer-home-final');
        assert.equal(output.response.homeTransactionId, 'payer-home-final');
        assert.equal(fixture.deleted, true);
        assert.ok(fixture.postedTransfer);
        assert.equal(
            Object.prototype.hasOwnProperty.call(fixture.postedTransfer, 'homeTransactionId'),
            false,
        );
        assert.deepEqual(fixture.postedTransfer.extensionList, {
            extension: [
                {key: 'payerFee', value: '1'},
                {key: 'homeTransactionId', value: 'payer-home-final'},
            ],
        });
        assert.deepEqual(
            (fixture.publishedMessages[0]?.content as TransactionMessage.TransfersContent).request,
            fixture.postedTransfer,
        );
    });

    it('retains the initial payer home transaction ID when the third call omits it', async () => {
        const cachedRequest = transferRequest();
        const fixture = createHandler(cachedRequest);

        const output = await fixture.handler.execute(
            new PutAcceptQuoteCommand(
                new PutAcceptQuoteCommand.Input('transfer-1', true, 'wallet1'),
            ),
        );

        assert.equal(fixture.savedRequest, undefined);
        assert.equal(output.response.homeTransactionId, 'payer-home-initial');
        assert.deepEqual(fixture.postedTransfer?.extensionList, {
            extension: [
                {key: 'payerFee', value: '1'},
                {key: 'homeTransactionId', value: 'payer-home-initial'},
            ],
        });
        assert.deepEqual(
            (fixture.publishedMessages[0]?.content as TransactionMessage.TransfersContent).request,
            fixture.postedTransfer,
        );
    });

    it('rejects acceptQuote when fspiop-source differs from the cached payer FSP', async () => {
        const cachedRequest = transferRequest();
        let postTransfersCalled = false;
        let savedRequest = false;

        const handler = new PutAcceptQuoteHandler(
            {
                settings: {transfersUrl: 'http://transfers'},
                async postTransfers(): Promise<void> {
                    postTransfersCalled = true;
                },
            } as never,
            {
                async waitFor(): Promise<TransfersIDPutResponse> {
                    return new TransfersIDPutResponse();
                },
                cancel(): void {
                },
            } as never,
            {
                async acquireLock(): Promise<string> {
                    return 'lock-token';
                },
                async releaseLock(): Promise<void> {
                },
                async get(): Promise<TransferRequest> {
                    return cachedRequest;
                },
                async set(): Promise<void> {
                    savedRequest = true;
                },
                async delete(): Promise<void> {
                },
            } as never,
            {
                async publish(message: TransactionMessage): Promise<void> {
                    assert.ok(message);
                },
            } as never,
            {
                validate(): void {
                },
            } as never,
        );

        await assert.rejects(
            () => handler.execute(
                new PutAcceptQuoteCommand(
                    new PutAcceptQuoteCommand.Input(
                        'transfer-1',
                        true,
                        'wallet2',
                        'payer-home-unauthorized',
                    ),
                ),
            ),
            (error: unknown) => error instanceof FspiopException
                && error.errorDefinition.errorType.code === FspiopErrors.PAYER_PERMISSION_ERROR.errorType.code,
        );
        assert.equal(postTransfersCalled, false);
        assert.equal(savedRequest, false);
        assert.equal(cachedRequest.homeTransactionId, 'payer-home-initial');
    });
});

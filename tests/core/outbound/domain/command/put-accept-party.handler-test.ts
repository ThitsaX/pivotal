import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TransactionMessage} from '../../../../../packages/core/audit/common';
import {TransferRequest} from '../../../../../packages/core/outbound/domain/cache';
import {PutAcceptPartyCommand} from '../../../../../packages/core/outbound/domain/command/put-accept-party.command';
import {PutAcceptPartyHandler} from '../../../../../packages/core/outbound/domain/command/put-accept-party.handler';
import {FspParty} from '../../../../../packages/core/outbound/domain/dto';
import {
    AmountType,
    Currency,
    ExtensionList,
    Money,
    Party,
    PartyIdInfo,
    PartyIdType,
    QuotesIDPutResponse,
    TransactionInitiatorType,
    TransactionScenario,
} from '../../../../../packages/shared/fspiop';

function money(amount: string): Money {
    const value = new Money();
    value.amount = amount;
    value.currency = Currency.Usd;

    return value;
}

function party(fspId: string, id: string): Party {
    const partyIdInfo = new PartyIdInfo();
    partyIdInfo.fspId = fspId;
    partyIdInfo.partyIdType = PartyIdType.Msisdn;
    partyIdInfo.partyIdentifier = id;

    const value = new Party();
    value.partyIdInfo = partyIdInfo;

    return value;
}

function fspParty(fspId: string, id: string): FspParty {
    const value = new FspParty();
    value.type = TransactionInitiatorType.Consumer;
    value.fspId = fspId;
    value.idType = PartyIdType.Msisdn;
    value.idValue = id;

    return value;
}

function transferRequest(): TransferRequest {
    const request = new TransferRequest();
    request.payer = party('wallet1', '2769100001');
    request.payee = party('wallet2', '2769200001');
    request.transferId = 'transfer-1';
    request.homeTransactionId = 'home-1';
    request.initiatedTimestamp = '2026-05-27T00:00:00.000Z';
    request.from = fspParty('wallet1', '2769100001');
    request.to = fspParty('wallet2', '2769200001');
    request.amountType = AmountType.Send;
    request.currency = Currency.Usd;
    request.amount = '10';
    request.transactionType = TransactionScenario.Transfer;
    request.subScenario = 'PERSON_TO_PERSON';

    return request;
}

describe('PutAcceptPartyHandler', () => {

    it('uses the confirmed acceptParty amount when posting the quote request', async () => {
        const cachedRequest = transferRequest();
        let postedQuoteAmount: string | undefined;
        let postedQuoteExtensionList: ExtensionList | undefined;
        let savedRequest: TransferRequest | undefined;
        const extensionList: ExtensionList = {
            extension: [
                {key: 'payerFee', value: '1.23'},
                {key: 'payerFeeCurrency', value: 'USD'},
            ],
        };

        const callback = new QuotesIDPutResponse();
        callback.transferAmount = money('44.44');
        callback.payeeReceiveAmount = money('44.44');
        callback.payeeFspFee = money('0');

        const handler = new PutAcceptPartyHandler(
            {
                settings: {quotesUrl: 'http://quotes'},
                async postQuotes(
                    _url: string,
                    _headers: unknown,
                    body: {amount?: Money; extensionList?: ExtensionList},
                ): Promise<void> {
                    postedQuoteAmount = body.amount?.amount;
                    postedQuoteExtensionList = body.extensionList;
                },
            } as never,
            {
                async waitFor(): Promise<QuotesIDPutResponse> {
                    return callback;
                },
                cancel(): void {
                },
            } as never,
            {
                async get(): Promise<TransferRequest> {
                    return cachedRequest;
                },
                async set(_key: string, value: TransferRequest): Promise<void> {
                    savedRequest = value;
                },
                async delete(): Promise<void> {
                },
            } as never,
            {
                async publish(message: TransactionMessage): Promise<void> {
                    assert.ok(message);
                },
            } as never,
        );

        const output = await handler.execute(
            new PutAcceptPartyCommand(new PutAcceptPartyCommand.Input('transfer-1', true, ' 44.44 ', extensionList)),
        );

        assert.equal(postedQuoteAmount, '44.44');
        assert.deepEqual(postedQuoteExtensionList, extensionList);
        assert.equal(savedRequest?.amount, '44.44');
        assert.equal(output.response.amount, '44.44');
    });
});

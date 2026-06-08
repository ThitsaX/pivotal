import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TransactionMessage} from '../../../../../packages/core/audit/common';
import {TransferRequest} from '../../../../../packages/core/outbound/domain/cache';
import {PutAcceptQuoteCommand} from '../../../../../packages/core/outbound/domain/command/put-accept-quote.command';
import {PutAcceptQuoteHandler} from '../../../../../packages/core/outbound/domain/command/put-accept-quote.handler';
import {
    FspiopErrors,
    FspiopException,
    Party,
    PartyIdInfo,
    PartyIdType,
    TransfersIDPutResponse,
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

    return request;
}

describe('PutAcceptQuoteHandler', () => {

    it('rejects acceptQuote when fspiop-source differs from the cached payer FSP', async () => {
        const cachedRequest = transferRequest();
        let postTransfersCalled = false;

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
                async get(): Promise<TransferRequest> {
                    return cachedRequest;
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
                new PutAcceptQuoteCommand(new PutAcceptQuoteCommand.Input('transfer-1', true, 'wallet2')),
            ),
            (error: unknown) => error instanceof FspiopException
                && error.errorDefinition.errorType.code === FspiopErrors.PAYER_PERMISSION_ERROR.errorType.code,
        );
        assert.equal(postTransfersCalled, false);
    });
});

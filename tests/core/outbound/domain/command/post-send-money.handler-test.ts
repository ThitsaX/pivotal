import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TransactionMessage} from '../../../../../packages/core/audit/common';
import {PostSendMoneyCommand} from '../../../../../packages/core/outbound/domain/command/post-send-money.command';
import {PostSendMoneyHandler} from '../../../../../packages/core/outbound/domain/command/post-send-money.handler';
import {FspParty, SendMoneyRequest} from '../../../../../packages/core/outbound/domain/dto';
import {
    AmountType,
    Currency,
    FspiopHeaders,
    FspiopPubSubSubjects,
    PartiesTypeIDPutResponse,
    PartyIdType,
    TransactionScenario,
} from '../../../../../packages/shared/fspiop';

function party(idType: PartyIdType, idValue: string, fspId?: string): FspParty {
    const value = new FspParty();
    value.idType = idType;
    value.idValue = idValue;
    value.fspId = fspId;
    return value;
}

function request(): SendMoneyRequest {
    const value = new SendMoneyRequest();
    value.homeTransactionId = 'home-transaction-1';
    value.from = party(PartyIdType.Msisdn, '2769100001', 'payerfsp');
    value.to = party(PartyIdType.Alias, 'merchant-123');
    value.amountType = AmountType.Send;
    value.currency = Currency.Usd;
    value.amount = '100';
    value.transactionType = TransactionScenario.Transfer;
    value.subScenario = 'PERSON_TO_BUSINESS';
    value.note = '';
    return value;
}

function callback(): PartiesTypeIDPutResponse {
    return {
        party: {
            partyIdInfo: {
                partyIdType: PartyIdType.Alias,
                partyIdentifier: 'merchant-123',
                fspId: 'resolvedfsp',
            },
            name: 'Merchant One',
        },
    } as PartiesTypeIDPutResponse;
}

describe('PostSendMoneyHandler optional payee FSP', () => {
    it('omits an empty destination and continues with the FSP resolved by party lookup', async () => {
        let requestHeaders: Record<string, string> | undefined;
        let cachedRequest: unknown;
        const auditMessages: Array<TransactionMessage> = [];
        const response = callback();

        const handler = new PostSendMoneyHandler(
            {
                settings: {partiesUrl: 'http://hub/parties', switchId: 'hub'},
                async getParties(_url: string, headers: Record<string, string>): Promise<void> {
                    requestHeaders = headers;
                },
            } as never,
            {
                waitFor<T>(successSubject: string, errorSubject: string): Promise<T> {
                    assert.equal(
                        successSubject,
                        FspiopPubSubSubjects.Parties.forSuccess(
                            'payerfsp',
                            undefined,
                            PartyIdType.Alias,
                            'merchant-123',
                        ),
                    );
                    assert.equal(
                        errorSubject,
                        FspiopPubSubSubjects.Parties.forError(
                            'payerfsp',
                            undefined,
                            PartyIdType.Alias,
                            'merchant-123',
                        ),
                    );
                    return Promise.resolve(response as T);
                },
                cancel(): void {},
            } as never,
            {
                async set(_key: string, value: unknown): Promise<void> {
                    cachedRequest = value;
                },
                async delete(): Promise<void> {},
            } as never,
            {
                async publish(message: TransactionMessage): Promise<void> {
                    auditMessages.push(message);
                },
            } as never,
            {validate(): void {}} as never,
        );

        const output = await handler.execute(new PostSendMoneyCommand(
            new PostSendMoneyCommand.Input('transfer-1', 'payerfsp', request()),
        ));

        assert.equal(requestHeaders?.[FspiopHeaders.Names.FSPIOP_DESTINATION], undefined);
        assert.equal((cachedRequest as {to: FspParty}).to.fspId, 'resolvedfsp');
        assert.equal((cachedRequest as {note?: string}).note, undefined);
        assert.equal(output.response.to?.fspId, 'resolvedfsp');
        assert.equal(auditMessages.length, 2);
        assert.equal(auditMessages[0]?.content.payeeFsp, '');
        assert.equal(auditMessages[1]?.content.payeeFsp, 'resolvedfsp');
    });
});

import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TransactionMessage} from '../../../../../packages/core/audit/common';
import {TransferRequest} from '../../../../../packages/core/outbound/domain/cache';
import {PostSendMoneyCommand} from '../../../../../packages/core/outbound/domain/command/post-send-money.command';
import {PostSendMoneyHandler} from '../../../../../packages/core/outbound/domain/command/post-send-money.handler';
import {GovernmentPayerDisplayNameStore} from '../../../../../packages/core/outbound/domain/component/government-payer-display-name-store';
import {GovernmentPayerNameResolver} from '../../../../../packages/core/outbound/domain/component/government-payer-name-resolver';
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

class MapGovernmentPayerDisplayNameStore extends GovernmentPayerDisplayNameStore {
    constructor(private readonly names: ReadonlyMap<string, string>) {
        super();
    }

    get(fspId: string): string | undefined {
        return this.names.get(fspId);
    }
}

function createHandler(
    deps: {
        getParties?: (url: string, headers: Record<string, string>) => Promise<void>;
        waitFor?: <T>(successSubject: string, errorSubject: string) => Promise<T>;
        set?: (key: string, value: unknown) => Promise<void>;
        publish?: (message: TransactionMessage) => Promise<void>;
    } = {},
    names: ReadonlyMap<string, string> = new Map(),
): PostSendMoneyHandler {
    return new PostSendMoneyHandler(
        {
            settings: {partiesUrl: 'http://hub/parties', switchId: 'hub'},
            async getParties(url: string, headers: Record<string, string>): Promise<void> {
                if (deps.getParties != null) {
                    await deps.getParties(url, headers);
                }
            },
        } as never,
        {
            waitFor<T>(successSubject: string, errorSubject: string): Promise<T> {
                if (deps.waitFor != null) {
                    return deps.waitFor(successSubject, errorSubject);
                }
                return Promise.resolve(callback() as T);
            },
            cancel(): void {},
        } as never,
        {
            async set(key: string, value: unknown): Promise<void> {
                if (deps.set != null) {
                    await deps.set(key, value);
                }
            },
            async delete(): Promise<void> {},
        } as never,
        {
            async publish(message: TransactionMessage): Promise<void> {
                if (deps.publish != null) {
                    await deps.publish(message);
                }
            },
        } as never,
        {validate(): void {}} as never,
        new GovernmentPayerNameResolver(new MapGovernmentPayerDisplayNameStore(names)),
    );
}

describe('PostSendMoneyHandler optional payee FSP', () => {
    it('omits an empty destination and continues with the FSP resolved by party lookup', async () => {
        let requestHeaders: Record<string, string> | undefined;
        let cachedRequest: unknown;
        const auditMessages: Array<TransactionMessage> = [];
        const response = callback();

        const handler = createHandler({
            async getParties(_url: string, headers: Record<string, string>): Promise<void> {
                requestHeaders = headers;
            },
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
            async set(_key: string, value: unknown): Promise<void> {
                cachedRequest = value;
            },
            async publish(message: TransactionMessage): Promise<void> {
                auditMessages.push(message);
            },
        });

        const output = await handler.execute(new PostSendMoneyCommand(
            new PostSendMoneyCommand.Input('transfer-1', 'payerfsp', request()),
        ));

        assert.equal(requestHeaders?.[FspiopHeaders.Names.FSPIOP_DESTINATION], undefined);
        assert.equal((cachedRequest as {to: FspParty}).to.fspId, 'resolvedfsp');
        assert.equal((cachedRequest as {note?: string}).note, undefined);
        assert.equal(output.response.to?.fspId, 'resolvedfsp');
        assert.equal(auditMessages.length, 2);
        assert.equal((auditMessages[0]?.content as {payeeFsp?: string}).payeeFsp, '');
        assert.equal((auditMessages[0]?.content as {amountType?: string}).amountType, AmountType.Send);
        assert.equal((auditMessages[1]?.content as {payeeFsp?: string}).payeeFsp, 'resolvedfsp');
    });

    it('fills a blank government payer name on the cached payer, the cached from and the response', async () => {
        let cachedRequest: TransferRequest | undefined;
        const sendMoneyRequest = request();
        sendMoneyRequest.subScenario = 'GOVERNMENT_TO_PERSON';

        const handler = createHandler({
            async set(_key: string, value: unknown): Promise<void> {
                cachedRequest = value as TransferRequest;
            },
        }, new Map([['payerfsp', 'Treasury']]));

        const output = await handler.execute(new PostSendMoneyCommand(
            new PostSendMoneyCommand.Input('transfer-1', 'payerfsp', sendMoneyRequest),
        ));

        assert.equal(sendMoneyRequest.from.displayName, undefined);
        assert.notEqual(cachedRequest?.from, sendMoneyRequest.from);
        assert.equal(cachedRequest?.from.displayName, 'Treasury');
        assert.equal(cachedRequest?.payer.name, 'Treasury');
        assert.equal(output.response.from?.displayName, 'Treasury');
        assert.equal(cachedRequest?.from.idValue, '2769100001');
    });

    it('leaves the payer name blank when the source has none, even if the body names a configured DFSP', async () => {
        let cachedRequest: TransferRequest | undefined;
        const sendMoneyRequest = request();
        sendMoneyRequest.subScenario = 'GOVERNMENT_TO_PERSON';
        sendMoneyRequest.from.fspId = 'configuredfsp';
        sendMoneyRequest.from.idValue = 'configuredfsp';

        const handler = createHandler({
            async set(_key: string, value: unknown): Promise<void> {
                cachedRequest = value as TransferRequest;
            },
        }, new Map([['configuredfsp', 'Treasury']]));

        const output = await handler.execute(new PostSendMoneyCommand(
            new PostSendMoneyCommand.Input('transfer-1', 'payerfsp', sendMoneyRequest),
        ));

        assert.equal(cachedRequest?.from, sendMoneyRequest.from);
        assert.equal(cachedRequest?.from.displayName, undefined);
        assert.equal(cachedRequest?.payer.name, undefined);
        assert.equal(output.response.from?.displayName, undefined);
    });
});

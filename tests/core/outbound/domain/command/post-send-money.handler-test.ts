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

function golSwitchSettings(
    fspIds: readonly string[] = ['mofdp', 'cbl'],
    name = 'GOL National Payment Switch',
) {
    return {
        golNationalPaymentSwitchFspIds: new Set(fspIds),
        golNationalPaymentSwitchName: name,
    } as never;
}

function createHandler(
    deps: {
        getParties?: (url: string, headers: Record<string, string>) => Promise<void>;
        waitFor?: <T>(successSubject: string, errorSubject: string) => Promise<T>;
        set?: (key: string, value: unknown) => Promise<void>;
        publish?: (message: TransactionMessage) => Promise<void>;
        settings?: never;
    } = {},
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
        deps.settings ?? golSwitchSettings(),
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
});

describe('PostSendMoneyHandler GOL National Payment Switch GOVERNMENT_TO_PERSON payer name', () => {
    function executeWith(
        sendMoneyRequest: SendMoneyRequest,
        source = 'mofdp',
        settings: never = golSwitchSettings(),
    ): Promise<{cachedRequest: unknown}> {
        let cachedRequest: unknown;

        const handler = createHandler({
            async set(_key: string, value: unknown): Promise<void> {
                cachedRequest = value;
            },
            settings,
        });

        return handler.execute(new PostSendMoneyCommand(
            new PostSendMoneyCommand.Input(`transfer-${source}-1`, source, sendMoneyRequest),
        )).then(() => ({cachedRequest}));
    }

    it('defaults blank MOFDP G2P payer displayName to GOL National Payment Switch', async () => {
        const sendMoneyRequest = request();
        sendMoneyRequest.from = party(PartyIdType.Business, 'mofdp', 'mofdp');
        sendMoneyRequest.subScenario = 'GOVERNMENT_TO_PERSON';

        const {cachedRequest} = await executeWith(sendMoneyRequest);

        assert.equal(
            (cachedRequest as {payer: {name?: string}}).payer.name,
            'GOL National Payment Switch',
        );
        assert.equal(sendMoneyRequest.from.displayName, 'GOL National Payment Switch');
    });

    it('defaults blank CBL G2P payer displayName to GOL National Payment Switch', async () => {
        const sendMoneyRequest = request();
        sendMoneyRequest.from = party(PartyIdType.Business, 'cbl', 'cbl');
        sendMoneyRequest.subScenario = 'GOVERNMENT_TO_PERSON';

        const {cachedRequest} = await executeWith(sendMoneyRequest, 'cbl');

        assert.equal(
            (cachedRequest as {payer: {name?: string}}).payer.name,
            'GOL National Payment Switch',
        );
        assert.equal(sendMoneyRequest.from.displayName, 'GOL National Payment Switch');
    });

    it('defaults blank MOFDP G2P refund payer displayName to GOL National Payment Switch', async () => {
        const sendMoneyRequest = request();
        sendMoneyRequest.from = party(PartyIdType.Business, 'mofdp', 'mofdp');
        sendMoneyRequest.subScenario = 'GOVERNMENT_TO_PERSON_REFUND';

        const {cachedRequest} = await executeWith(sendMoneyRequest);

        assert.equal(
            (cachedRequest as {payer: {name?: string}}).payer.name,
            'GOL National Payment Switch',
        );
    });

    it('does not override an explicit MOFDP G2P payer displayName', async () => {
        const sendMoneyRequest = request();
        sendMoneyRequest.from = party(PartyIdType.Business, 'mofdp', 'mofdp');
        sendMoneyRequest.from.displayName = 'Custom MOFDP Name';
        sendMoneyRequest.subScenario = 'GOVERNMENT_TO_PERSON';

        const {cachedRequest} = await executeWith(sendMoneyRequest);

        assert.equal((cachedRequest as {payer: {name?: string}}).payer.name, 'Custom MOFDP Name');
    });

    it('does not default payer name for non-configured or non-G2P transfers', async () => {
        const sendMoneyRequest = request();
        sendMoneyRequest.from = party(PartyIdType.Msisdn, '2769100001', 'payerfsp');
        sendMoneyRequest.subScenario = 'GOVERNMENT_TO_PERSON';

        const {cachedRequest} = await executeWith(sendMoneyRequest);

        assert.equal((cachedRequest as {payer: {name?: string}}).payer.name, undefined);
    });

    it('does not default when no FSP ids are configured', async () => {
        const sendMoneyRequest = request();
        sendMoneyRequest.from = party(PartyIdType.Business, 'mofdp', 'mofdp');
        sendMoneyRequest.subScenario = 'GOVERNMENT_TO_PERSON';

        const {cachedRequest} = await executeWith(
            sendMoneyRequest,
            'mofdp',
            golSwitchSettings([]),
        );

        assert.equal((cachedRequest as {payer: {name?: string}}).payer.name, undefined);
    });
});

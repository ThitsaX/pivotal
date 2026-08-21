import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    FspiopPubSubSubjects,
    FspiopResponseSubscriber,
    PartyIdType,
} from '../../../../packages/shared/fspiop';

const encoder = new TextEncoder();

function subscriber(): FspiopResponseSubscriber {
    return new FspiopResponseSubscriber({
        codec: {
            decode(data: Uint8Array): unknown {
                return JSON.parse(new TextDecoder().decode(data));
            },
        },
    } as never);
}

function dispatch(instance: FspiopResponseSubscriber, subject: string, payload: unknown): void {
    const target = instance as unknown as {dispatch(message: unknown): void};
    target.dispatch({
        subject,
        data: encoder.encode(JSON.stringify(payload)),
        ack(): void {},
    });
}

describe('FspiopResponseSubscriber payee resolution', () => {
    it('matches a resolved payee callback to a destination-less waiter', async () => {
        const instance = subscriber();
        const successSubject = FspiopPubSubSubjects.Parties.forSuccess(
            'payerfsp',
            undefined,
            PartyIdType.Alias,
            'merchant-123',
        );
        const errorSubject = FspiopPubSubSubjects.Parties.forError(
            'payerfsp',
            undefined,
            PartyIdType.Alias,
            'merchant-123',
        );
        const payload = {party: {partyIdInfo: {fspId: 'resolvedfsp'}}};
        const result = instance.waitFor<typeof payload>(successSubject, errorSubject, undefined, 1_000);

        dispatch(
            instance,
            FspiopPubSubSubjects.Parties.forSuccess(
                'payerfsp',
                'resolvedfsp',
                PartyIdType.Alias,
                'merchant-123',
            ),
            payload,
        );

        assert.deepEqual(await result, payload);
    });

    it('matches a callback received before the destination-less waiter is registered', async () => {
        const instance = subscriber();
        const payload = {party: {partyIdInfo: {fspId: 'resolvedfsp'}}};

        dispatch(
            instance,
            FspiopPubSubSubjects.Parties.forSuccess(
                'payerfsp',
                'resolvedfsp',
                PartyIdType.Business,
                'business-123',
            ),
            payload,
        );

        const result = instance.waitFor<typeof payload>(
            FspiopPubSubSubjects.Parties.forSuccess(
                'payerfsp',
                undefined,
                PartyIdType.Business,
                'business-123',
            ),
            FspiopPubSubSubjects.Parties.forError(
                'payerfsp',
                undefined,
                PartyIdType.Business,
                'business-123',
            ),
            undefined,
            1_000,
        );

        assert.deepEqual(await result, payload);
    });
});

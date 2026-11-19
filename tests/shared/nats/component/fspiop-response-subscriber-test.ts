import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FspiopPubSubSubjects, FspiopResponseSubscriber, PartyIdType } from '../../../../packages/shared/fspiop';

const encoder = new TextEncoder();

const PAYEE_PAYLOAD = { party: { partyIdInfo: { fspId: 'resolvedfsp' } } };
const ANY_PAYEE_SUCCESS = FspiopPubSubSubjects.Parties.forSuccess(
    'payerfsp',
    undefined,
    PartyIdType.Alias,
    'merchant-123',
);
const ANY_PAYEE_ERROR = FspiopPubSubSubjects.Parties.forError('payerfsp', undefined, PartyIdType.Alias, 'merchant-123');
const RESOLVED_PAYEE_SUCCESS = FspiopPubSubSubjects.Parties.forSuccess(
    'payerfsp',
    'resolvedfsp',
    PartyIdType.Alias,
    'merchant-123',
);

const RESOLVED_PAYEE_ERROR = FspiopPubSubSubjects.Parties.forError(
    'payerfsp',
    'resolvedfsp',
    PartyIdType.Alias,
    'merchant-123',
);

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
    const target = instance as unknown as { dispatch(message: unknown): void };
    target.dispatch({
        subject,
        data: encoder.encode(JSON.stringify(payload)),
        ack(): void {},
    });
}

describe('FspiopResponseSubscriber payee resolution', () => {
    it('matches a resolved payee callback to a destination-less waiter', async () => {
        const instance = subscriber();

        const waiter = instance.waitFor<typeof PAYEE_PAYLOAD>(ANY_PAYEE_SUCCESS, ANY_PAYEE_ERROR, undefined, 1_000);

        dispatch(
            instance,
            FspiopPubSubSubjects.Parties.forSuccess('payerfsp', 'resolvedfsp', PartyIdType.Alias, 'merchant-123'),
            PAYEE_PAYLOAD,
        );

        assert.deepEqual(await waiter.promise, PAYEE_PAYLOAD);
    });

    it('resolves both waiters on the same subject from a single success callback', async () => {
        const instance = subscriber();

        const waiter1 = instance.waitFor<typeof PAYEE_PAYLOAD>(
            RESOLVED_PAYEE_SUCCESS,
            RESOLVED_PAYEE_ERROR,
            undefined,
            1_000,
        );
        const waiter2 = instance.waitFor<typeof PAYEE_PAYLOAD>(
            RESOLVED_PAYEE_SUCCESS,
            RESOLVED_PAYEE_ERROR,
            undefined,
            1_000,
        );

        dispatch(
            instance,
            FspiopPubSubSubjects.Parties.forSuccess('payerfsp', 'resolvedfsp', PartyIdType.Alias, 'merchant-123'),
            PAYEE_PAYLOAD,
        );

        const [result1, result2] = await Promise.all([waiter1.promise, waiter2.promise]);

        assert.deepEqual(result1, PAYEE_PAYLOAD);
        assert.deepEqual(result2, PAYEE_PAYLOAD);
    });

    it('does not cancel other waiters when one waiter is cancelled', async () => {
        const instance = subscriber();

        const waiter1 = instance.waitFor<typeof PAYEE_PAYLOAD>(
            RESOLVED_PAYEE_SUCCESS,
            RESOLVED_PAYEE_ERROR,
            undefined,
            1_000,
        );
        const waiter2 = instance.waitFor<typeof PAYEE_PAYLOAD>(
            RESOLVED_PAYEE_SUCCESS,
            RESOLVED_PAYEE_ERROR,
            undefined,
            1_000,
        );

        waiter1.cancel();

        dispatch(
            instance,
            FspiopPubSubSubjects.Parties.forSuccess('payerfsp', 'resolvedfsp', PartyIdType.Alias, 'merchant-123'),
            PAYEE_PAYLOAD,
        );

        const result2 = await waiter2.promise;
        assert.deepEqual(result2, PAYEE_PAYLOAD);
    });

    it('does not affect other waiters when one waiter times out', async () => {
        const instance = subscriber();

        const waiter1 = instance.waitFor<typeof PAYEE_PAYLOAD>(ANY_PAYEE_SUCCESS, ANY_PAYEE_ERROR, undefined, 50);

        const waiter2 = instance.waitFor<typeof PAYEE_PAYLOAD>(ANY_PAYEE_SUCCESS, ANY_PAYEE_ERROR, undefined, 1_000);

        await assert.rejects(waiter1.promise, (err: any) => err.errorDefinition?.errorType?.code === '2004');

        dispatch(instance, RESOLVED_PAYEE_SUCCESS, PAYEE_PAYLOAD);

        const result2 = await waiter2.promise;
        assert.deepEqual(result2, PAYEE_PAYLOAD);
    });

    it('rejects only the oldest waiter on error callback and resolves the next waiter on later success', async () => {
        const instance = subscriber();

        const waiter1 = instance.waitFor<any>(ANY_PAYEE_SUCCESS, ANY_PAYEE_ERROR, undefined, 1_000);
        const waiter2 = instance.waitFor<any>(ANY_PAYEE_SUCCESS, ANY_PAYEE_ERROR, undefined, 1_000);

        const errorPayload = {
            errorInformation: {
                errorCode: '3200',
                errorDescription: 'Payee not found',
            },
        };
        dispatch(instance, RESOLVED_PAYEE_ERROR, errorPayload);

        await assert.rejects(waiter1.promise, (err: any) => err.errorDefinition?.errorType?.code === '3200');

        dispatch(instance, RESOLVED_PAYEE_SUCCESS, PAYEE_PAYLOAD);

        const result2 = await waiter2.promise;
        assert.deepEqual(result2, PAYEE_PAYLOAD);
    });

    it('handles callbacks arriving while HTTP request is in-flight before await is called (covers original cache concern)', async () => {
        const instance = subscriber();

        const waiter = instance.waitFor<typeof PAYEE_PAYLOAD>(ANY_PAYEE_SUCCESS, ANY_PAYEE_ERROR, undefined, 1_000);

        dispatch(instance, RESOLVED_PAYEE_SUCCESS, PAYEE_PAYLOAD);

        const result = await waiter.promise;

        assert.deepEqual(result, PAYEE_PAYLOAD);
    });

    it('matches with several waiters when using the _any_ payee fallback', async () => {
        const instance = subscriber();

        const waiter1 = instance.waitFor<typeof PAYEE_PAYLOAD>(ANY_PAYEE_SUCCESS, ANY_PAYEE_ERROR, undefined, 1_000);
        const waiter2 = instance.waitFor<typeof PAYEE_PAYLOAD>(ANY_PAYEE_SUCCESS, ANY_PAYEE_ERROR, undefined, 1_000);

        dispatch(instance, RESOLVED_PAYEE_SUCCESS, PAYEE_PAYLOAD);

        const [result1, result2] = await Promise.all([waiter1.promise, waiter2.promise]);

        assert.deepEqual(result1, PAYEE_PAYLOAD);
        assert.deepEqual(result2, PAYEE_PAYLOAD);
    });
});

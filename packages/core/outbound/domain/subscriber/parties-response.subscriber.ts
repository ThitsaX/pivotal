import {Injectable} from '@nestjs/common';
import {Subscription} from 'nats';
import {NatsClientService} from '@shared/nats';
import {
    ErrorInformationObject,
    FspiopErrors,
    FspiopException,
    PartiesTypeIDPutResponse,
} from '@shared/fspiop';

/**
 * Bridges the FSPIOP async callback pattern for party lookups using NATS.
 *
 * Race-condition-safe design
 * ──────────────────────────
 * NATS subscriptions are created SYNCHRONOUSLY inside waitFor() before it
 * returns the Promise. The caller must therefore invoke waitFor() BEFORE
 * firing the GET /parties request:
 *
 *   const waitPromise = subscriber.waitFor(correlationId);  // ← subscribe first
 *   await fspiopAxios.getParties(...);                       // ← then send
 *   const response = await waitPromise;                      // ← then await
 *
 * Even if the switch responds before the caller reaches `await waitPromise`,
 * NATS buffers the incoming message for the already-active subscription, so
 * the message is never lost.
 *
 * Subjects
 * ────────
 *   parties:<correlationId>        – published by HandlePutPartiesHandler
 *   parties-error:<correlationId>  – published by HandlePutPartiesErrorHandler
 */
@Injectable()
export class PartiesResponseSubscriber {

    static readonly SUBJECT_SUCCESS = (correlationId: string) => `parties:${correlationId}`;
    static readonly SUBJECT_ERROR   = (correlationId: string) => `parties-error:${correlationId}`;
    static readonly DEFAULT_TIMEOUT_MS = 30_000;

    private readonly pending = new Map<string, Subscription[]>();

    constructor(private readonly nats: NatsClientService) {}

    /**
     * Synchronously registers NATS subscriptions for both subjects, then
     * returns a Promise that resolves / rejects when either arrives or times out.
     *
     * MUST be called BEFORE sending GET /parties to prevent the race condition.
     */
    waitFor(
        correlationId: string,
        timeoutMs = PartiesResponseSubscriber.DEFAULT_TIMEOUT_MS,
    ): Promise<PartiesTypeIDPutResponse> {
        const nc    = this.nats.nc;
        const codec = this.nats.codec;

        // ── Subscriptions are created synchronously here ──────────────────────
        // nc.subscribe() is synchronous — the subscription is immediately active
        // on the NATS server side. Any message published to these subjects (even
        // before the caller awaits the returned Promise) will be buffered by NATS
        // and delivered when the async iterators below consume it. No race window.
        const successSub = nc.subscribe(PartiesResponseSubscriber.SUBJECT_SUCCESS(correlationId), {max: 1});
        const errorSub   = nc.subscribe(PartiesResponseSubscriber.SUBJECT_ERROR(correlationId),   {max: 1});
        // ──────────────────────────────────────────────────────────────────────

        this.pending.set(correlationId, [successSub, errorSub]);

        return new Promise<PartiesTypeIDPutResponse>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.cancel(correlationId);
                reject(new FspiopException(FspiopErrors.SERVER_TIMED_OUT));
            }, timeoutMs);

            // Settle the promise exactly once and clean up.
            const settle = (fn: () => void): void => {
                clearTimeout(timer);
                this.cancel(correlationId); // unsubscribes both; causes the other for-await to exit cleanly
                fn();
            };

            // ── Success path ─────────────────────────────────────────────────
            (async () => {
                for await (const msg of successSub) {
                    settle(() => resolve(codec.decode(msg.data) as PartiesTypeIDPutResponse));
                    return; // max:1 guarantees at most one iteration
                }
            })();

            // ── Error path ───────────────────────────────────────────────────
            (async () => {
                for await (const msg of errorSub) {
                    settle(() => {
                        const body     = codec.decode(msg.data) as ErrorInformationObject;
                        const code     = body.errorInformation?.errorCode ?? '';
                        const desc     = body.errorInformation?.errorDescription ?? 'Unknown error';
                        const extensionList = body.errorInformation?.extensionList;
                        const errorDef = FspiopErrors.find(code) ?? FspiopErrors.GENERIC_SERVER_ERROR;
                        reject(new FspiopException(errorDef, desc, extensionList));
                    });
                    return; // max:1 guarantees at most one iteration
                }
            })();
        });
    }

    /**
     * Cancels a pending correlation by unsubscribing from both NATS subjects.
     * Call this when the outbound GET /parties request itself fails so the
     * subscriptions do not linger until the timeout fires.
     */
    cancel(correlationId: string): void {
        const subs = this.pending.get(correlationId);
        if (!subs) return;
        this.pending.delete(correlationId);
        for (const sub of subs) {
            sub.unsubscribe();
        }
    }
}

import {Injectable} from '@nestjs/common';
import {Subscription} from 'nats';
import {NatsClientService} from '@shared/nats';
import {ErrorInformationObject} from '../../dto';
import {FspiopErrors} from '../../exception/fspiop-errors';
import {FspiopException} from '../../exception/fspiop-exception';

/**
 * Subscribes to FSPIOP callback messages on NATS and resolves or rejects a
 * Promise based on what arrives first — a success response, an error response,
 * an optional hub error response, or a timeout.
 *
 * Race-condition-safe design
 * ──────────────────────────
 * NATS subscriptions are created SYNCHRONOUSLY inside waitFor() before the
 * Promise is returned. The caller MUST therefore invoke waitFor() BEFORE
 * sending the outbound FSPIOP request:
 *
 *   const waitPromise = subscriber.waitFor<PartiesTypeIDPutResponse>(
 *     FspiopPubSubSubjects.Parties.forSuccess(payer, payee, type, id),
 *     FspiopPubSubSubjects.Parties.forError(payer, payee, type, id),
 *   );
 *   try {
 *     await fspiopAxios.withHeaders(headers).getParties(...);
 *   } catch (err) {
 *     subscriber.cancel(successSubject);   // clean up on send failure
 *     throw err;
 *   }
 *   const response = await waitPromise;
 *
 * Even if the switch responds before the caller reaches `await waitPromise`,
 * NATS buffers the incoming message for the already-active subscription so
 * the message is never lost.
 *
 * Hub error (Parties only)
 * ────────────────────────
 * For Parties lookups the hub may return its own error on a separate subject
 * (e.g. when the hub itself cannot route the request). Pass hubErrorSubject as
 * the 4th argument to also subscribe to that channel:
 *
 *   subscriber.waitFor<PartiesTypeIDPutResponse>(
 *     FspiopPubSubSubjects.Parties.forSuccess(payer, payee, type, id),
 *     FspiopPubSubSubjects.Parties.forError(payer, payee, type, id),
 *     hubErrorSubject,  // ← 3rd param, Parties only
 *     DEFAULT_TIMEOUT_MS,
 *   );
 *
 * Quotes and Transfers have unique IDs so a single error subject is sufficient;
 * they should not pass hubErrorSubject.
 *
 * Timeout
 * ───────
 * If no message arrives within timeoutMs, waitFor() rejects with
 * FspiopException(SERVER_TIMED_OUT). The default is 30 seconds.
 */
@Injectable()
export class FspiopResponseSubscriber {

    static readonly DEFAULT_TIMEOUT_MS = 30_000;

    /** Pending subscriptions keyed by successSubject. */
    private readonly pending = new Map<string, Subscription[]>();

    constructor(private readonly nats: NatsClientService) {}

    /**
     * Synchronously registers NATS subscriptions, then returns a Promise that
     * resolves with T on success or rejects with FspiopException on error or
     * timeout.
     *
     * MUST be called BEFORE sending the outbound FSPIOP request.
     *
     * @param successSubject   e.g. FspiopPubSubSubjects.Parties.forSuccess(...)
     * @param errorSubject     e.g. FspiopPubSubSubjects.Parties.forError(...)
     * @param hubErrorSubject  Optional. Additional error subject for hub-originated
     *                         errors (Parties only). When provided a third NATS
     *                         subscription is registered alongside the other two.
     * @param timeoutMs        Max wait time in ms. Defaults to DEFAULT_TIMEOUT_MS.
     *                         Throws FspiopException(SERVER_TIMED_OUT) on expiry.
     */
    waitFor<T>(
        successSubject: string,
        errorSubject: string,
        hubErrorSubject?: string,
        timeoutMs = FspiopResponseSubscriber.DEFAULT_TIMEOUT_MS,
    ): Promise<T> {
        const nc    = this.nats.nc;
        const codec = this.nats.codec;

        // ── Subscriptions are created synchronously ───────────────────────────
        // nc.subscribe() registers immediately on the NATS server side.
        // Any message published before the caller awaits this Promise will be
        // buffered by NATS and delivered when the async iterators consume it.
        const successSub     = nc.subscribe(successSubject, {max: 1});
        const errorSub       = nc.subscribe(errorSubject,   {max: 1});
        const hubErrorSub    = hubErrorSubject != null
            ? nc.subscribe(hubErrorSubject, {max: 1})
            : null;
        // ──────────────────────────────────────────────────────────────────────

        const allSubs: Subscription[] = hubErrorSub != null
            ? [successSub, errorSub, hubErrorSub]
            : [successSub, errorSub];

        this.pending.set(successSubject, allSubs);

        return new Promise<T>((resolve, reject) => {

            const timer = setTimeout(() => {
                this.cancel(successSubject);
                reject(new FspiopException(
                    FspiopErrors.SERVER_TIMED_OUT,
                    `No FSPIOP callback received on '${successSubject}' within ${timeoutMs}ms.`,
                ));
            }, timeoutMs);

            /**
             * Settles the Promise exactly once, clears the timer and unsubscribes
             * all active subjects. cancel() closing the subscriptions causes any
             * remaining for-await loops to exit cleanly.
             */
            const settle = (fn: () => void): void => {
                clearTimeout(timer);
                this.cancel(successSubject);
                fn();
            };

            // ── Success path ──────────────────────────────────────────────────
            void (async () => {
                for await (const msg of successSub) {
                    settle(() => resolve(codec.decode(msg.data) as T));
                    return; // max:1 — at most one iteration
                }
            })();

            // ── FSP error path ────────────────────────────────────────────────
            void (async () => {
                for await (const msg of errorSub) {
                    settle(() => reject(FspiopResponseSubscriber.toFspiopException(
                        codec.decode(msg.data) as ErrorInformationObject,
                    )));
                    return; // max:1 — at most one iteration
                }
            })();

            // ── Hub error path (Parties only) ─────────────────────────────────
            // Only registered when hubErrorSubject is provided. Hub errors are
            // parsed identically to FSP errors — the ErrorInformationObject
            // content determines which FspiopException is thrown.
            if (hubErrorSub != null) {
                void (async () => {
                    for await (const msg of hubErrorSub) {
                        settle(() => reject(FspiopResponseSubscriber.toFspiopException(
                            codec.decode(msg.data) as ErrorInformationObject,
                        )));
                        return; // max:1 — at most one iteration
                    }
                })();
            }
        });
    }

    /**
     * Cancels a pending wait by unsubscribing from all registered NATS subjects
     * (success, error, and hub error if present).
     *
     * Call this when the outbound FSPIOP request itself fails so the
     * subscriptions do not linger until the timeout fires.
     *
     * @param successSubject The same successSubject passed to waitFor()
     */
    cancel(successSubject: string): void {
        const subs = this.pending.get(successSubject);
        if (!subs) return;
        this.pending.delete(successSubject);
        for (const sub of subs) {
            sub.unsubscribe();
        }
    }

    /**
     * Converts a raw ErrorInformationObject received over NATS into a
     * FspiopException, preserving the error code, description and extension list.
     * Falls back to GENERIC_SERVER_ERROR for unrecognised error codes.
     */
    private static toFspiopException(body: ErrorInformationObject): FspiopException {
        const code          = body.errorInformation?.errorCode        ?? '';
        const desc          = body.errorInformation?.errorDescription ?? 'Unknown FSPIOP error.';
        const extensionList = body.errorInformation?.extensionList;
        const errorDef      = FspiopErrors.find(code) ?? FspiopErrors.GENERIC_SERVER_ERROR;
        return new FspiopException(errorDef, desc, extensionList);
    }
}

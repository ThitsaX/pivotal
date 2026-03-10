import {Subscription} from 'nats';
import {NatsClientService} from '@shared/nats';
import {ErrorInformationObject} from '../../dto';
import {FspiopErrors} from '../../exception/fspiop-errors';
import {FspiopException} from '../../exception/fspiop-exception';

export class FspiopResponseSubscriber {

    static readonly DEFAULT_TIMEOUT_MS = 30_000;

    private readonly pending = new Map<string, Subscription[]>();

    constructor(private readonly nats: NatsClientService) {
    }

    private static toFspiopException(body: ErrorInformationObject): FspiopException {
        const code = body.errorInformation?.errorCode ?? '';
        const desc = body.errorInformation?.errorDescription ?? 'Unknown FSPIOP error.';
        const extensionList = body.errorInformation?.extensionList;
        const errorDef = FspiopErrors.find(code) ?? FspiopErrors.GENERIC_SERVER_ERROR;
        return new FspiopException(errorDef, desc, extensionList);
    }

    waitFor<T>(
        successSubject: string,
        errorSubject: string,
        hubErrorSubject?: string,
        timeoutMs = FspiopResponseSubscriber.DEFAULT_TIMEOUT_MS,
    ): Promise<T> {
        const nc = this.nats.nc;
        const codec = this.nats.codec;

        const successSub = nc.subscribe(successSubject, {max: 1});
        const errorSub = nc.subscribe(errorSubject, {max: 1});
        const hubErrorSub = hubErrorSubject != null
            ? nc.subscribe(hubErrorSubject, {max: 1})
            : null;

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

            const settle = (fn: () => void): void => {
                clearTimeout(timer);
                this.cancel(successSubject);
                fn();
            };

            void (async () => {
                for await (const msg of successSub) {
                    settle(() => resolve(codec.decode(msg.data) as T));
                    return;
                }
            })();

            void (async () => {
                for await (const msg of errorSub) {
                    settle(() => reject(FspiopResponseSubscriber.toFspiopException(
                        codec.decode(msg.data) as ErrorInformationObject,
                    )));
                    return;
                }
            })();

            if (hubErrorSub != null) {
                void (async () => {
                    for await (const msg of hubErrorSub) {
                        settle(() => reject(FspiopResponseSubscriber.toFspiopException(
                            codec.decode(msg.data) as ErrorInformationObject,
                        )));
                        return;
                    }
                })();
            }
        });
    }

    cancel(successSubject: string): void {
        const subs = this.pending.get(successSubject);
        if (!subs) return;
        this.pending.delete(successSubject);
        for (const sub of subs) {
            sub.unsubscribe();
        }
    }
}

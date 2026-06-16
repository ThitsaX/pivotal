import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {AckPolicy, ConsumerMessages, DeliverPolicy, JsMsg, ReplayPolicy} from 'nats';
import {NatsClientService} from '@shared/nats';
import {ErrorInformationObject} from '../../dto';
import {FspiopErrors} from '../../exception/fspiop-errors';
import {FspiopException} from '../../exception/fspiop-exception';
import {
    FSPIOP_RESPONSE_STREAM_SUBJECT,
    resolveFspiopResponseStream,
} from './fspiop-response-stream.resolver';

type PendingEntry = {
    readonly successSubject: string;
    readonly errorSubject: string;
    readonly hubErrorSubject: string | null;
    readonly resolve: (payload: unknown) => void;
    readonly reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout> | null;
};

type RecentEntry = {
    readonly subject: string;
    readonly payload: unknown;
    readonly expiresAt: number;
};

/**
 * Waits on FSPIOP callback messages published into the PIVOTAL_FSPIOP_RESPONSE JetStream
 * stream. One long-lived ephemeral consumer per replica reads every message on
 * `fspiop.response.>` and dispatches to the in-memory `pending` Map keyed by subject.
 *
 * Why per-replica long-lived (vs per-request ephemeral):
 *   - Per-request consumers at 200 TPS produce ~400 control-plane ops/s and thousands of
 *     concurrent consumers — well beyond JetStream's comfortable working set.
 *   - One consumer per replica means O(1) JetStream control-plane load regardless of TPS.
 *
 * Why LimitsPolicy retention (vs WorkQueuePolicy):
 *   - Parties callbacks are addressed by FSPIOP resource path, not by a unique transaction
 *     id. Concurrent waiters on the same tuple across replicas must each receive the
 *     callback. WorkQueuePolicy would deliver to only one replica.
 *
 * Race protection:
 *   - The waitFor()/publish() ordering in handlers already registers pending before the
 *     downstream HTTP request goes out. The recent-message cache is a defensive
 *     belt-and-braces for startup and cluster failover edge cases.
 */
export class FspiopResponseSubscriber implements OnModuleInit, OnModuleDestroy {

    static readonly DEFAULT_TIMEOUT_MS = 30_000;
    private static readonly RECENT_CACHE_TTL_MS = 60_000;
    private static readonly RECENT_CACHE_MAX_ENTRIES = 2_000;
    private static readonly CONSUMER_NAME_PREFIX = 'fspiop-response';

    private readonly logger = new Logger(FspiopResponseSubscriber.name);
    private readonly pending = new Map<string, PendingEntry>();
    private readonly recent = new Map<string, RecentEntry>();

    private consumerMessages: ConsumerMessages | null = null;
    private stream: string | null = null;
    private consumerName: string | null = null;
    private running = false;

    constructor(private readonly nats: NatsClientService) {
    }

    private static toFspiopException(body: ErrorInformationObject): FspiopException {
        const code = body.errorInformation?.errorCode ?? '';
        const desc = body.errorInformation?.errorDescription ?? 'Unknown FSPIOP error.';
        const extensionList = body.errorInformation?.extensionList;
        const errorDef = FspiopErrors.find(code) ?? FspiopErrors.GENERIC_SERVER_ERROR;
        return new FspiopException(errorDef, desc, extensionList);
    }

    async onModuleInit(): Promise<void> {
        const js = this.nats.nc.jetstream();
        const jsm = await js.jetstreamManager();
        this.stream = await resolveFspiopResponseStream(jsm);

        const consumerName = FspiopResponseSubscriber.makeConsumerName();
        await jsm.consumers.add(this.stream, {
            name: consumerName,
            filter_subject: FSPIOP_RESPONSE_STREAM_SUBJECT,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.New,
            replay_policy: ReplayPolicy.Instant,
            inactive_threshold: 5 * 60 * 1_000_000_000,
            max_ack_pending: 1_000,
        });
        this.consumerName = consumerName;

        const consumer = await js.consumers.get(this.stream, consumerName);
        this.consumerMessages = await consumer.consume();
        this.running = true;
        void this.consumeLoop(this.consumerMessages);

        this.logger.log(
            `FSPIOP response JetStream subscriber initialised (stream='${this.stream}' consumer='${consumerName}').`,
        );
    }

    async onModuleDestroy(): Promise<void> {
        this.running = false;
        this.consumerMessages?.stop();

        for (const subject of Array.from(this.pending.keys())) {
            this.cancel(subject);
        }
        this.pending.clear();
        this.recent.clear();

        if (this.stream != null && this.consumerName != null) {
            try {
                const jsm = await this.nats.nc.jetstream().jetstreamManager();
                await jsm.consumers.delete(this.stream, this.consumerName);
            } catch (error) {
                this.logger.warn(
                    `Failed to delete ephemeral consumer '${this.consumerName}' on stream '${this.stream}': ${(error as Error).message}`,
                );
            }
        }
    }

    waitFor<T>(
        successSubject: string,
        errorSubject: string,
        hubErrorSubject?: string,
        timeoutMs = FspiopResponseSubscriber.DEFAULT_TIMEOUT_MS,
    ): Promise<T> {
        const cached = this.takeFromRecent(successSubject, errorSubject, hubErrorSubject);

        if (cached != null) {
            return cached.subject === successSubject
                ? Promise.resolve(cached.payload as T)
                : Promise.reject(FspiopResponseSubscriber.toFspiopException(
                    cached.payload as ErrorInformationObject,
                ));
        }

        return new Promise<T>((resolve, reject) => {
            const entry: PendingEntry = {
                successSubject,
                errorSubject,
                hubErrorSubject: hubErrorSubject ?? null,
                resolve: payload => resolve(payload as T),
                reject,
                timer: null,
            };

            entry.timer = setTimeout(() => {
                this.cancel(successSubject);
                reject(new FspiopException(
                    FspiopErrors.SERVER_TIMED_OUT,
                    `No FSPIOP callback received on '${successSubject}' within ${timeoutMs}ms.`,
                ));
            }, timeoutMs);

            this.pending.set(successSubject, entry);
            this.pending.set(errorSubject, entry);

            if (hubErrorSubject != null) {
                this.pending.set(hubErrorSubject, entry);
            }
        });
    }

    cancel(successSubject: string): void {
        const entry = this.pending.get(successSubject);

        if (entry == null) {
            return;
        }

        this.pending.delete(entry.successSubject);
        this.pending.delete(entry.errorSubject);

        if (entry.hubErrorSubject != null) {
            this.pending.delete(entry.hubErrorSubject);
        }

        if (entry.timer != null) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
    }

    private async consumeLoop(messages: ConsumerMessages): Promise<void> {
        try {
            for await (const msg of messages) {
                try {
                    this.dispatch(msg);
                } catch (error) {
                    this.logger.error(
                        `Failed to dispatch FSPIOP response message on subject='${msg.subject}': ${(error as Error).message}`,
                        (error as Error).stack,
                    );
                } finally {
                    msg.ack();
                }
            }
        } catch (error) {
            if (this.running) {
                this.logger.error(
                    `FSPIOP response consume loop terminated unexpectedly: ${(error as Error).message}`,
                    (error as Error).stack,
                );
            }
        }
    }

    private dispatch(msg: JsMsg): void {
        const subject = msg.subject;
        const payload = this.nats.codec.decode(msg.data);
        const entry = this.pending.get(subject);

        if (entry == null) {
            this.addToRecent(subject, payload);
            return;
        }

        const isSuccess = subject === entry.successSubject;
        this.cancel(entry.successSubject);

        if (isSuccess) {
            entry.resolve(payload);
        } else {
            entry.reject(FspiopResponseSubscriber.toFspiopException(payload as ErrorInformationObject));
        }
    }

    private addToRecent(subject: string, payload: unknown): void {
        this.evictExpiredRecent();

        if (this.recent.size >= FspiopResponseSubscriber.RECENT_CACHE_MAX_ENTRIES) {
            const oldestKey = this.recent.keys().next().value;
            if (oldestKey != null) {
                this.recent.delete(oldestKey);
            }
        }

        this.recent.set(subject, {
            subject,
            payload,
            expiresAt: Date.now() + FspiopResponseSubscriber.RECENT_CACHE_TTL_MS,
        });
    }

    private takeFromRecent(
        successSubject: string,
        errorSubject: string,
        hubErrorSubject: string | undefined,
    ): RecentEntry | null {
        this.evictExpiredRecent();

        const candidates = hubErrorSubject != null
            ? [successSubject, errorSubject, hubErrorSubject]
            : [successSubject, errorSubject];

        for (const subject of candidates) {
            const entry = this.recent.get(subject);
            if (entry != null) {
                this.recent.delete(subject);
                return entry;
            }
        }

        return null;
    }

    private evictExpiredRecent(): void {
        const now = Date.now();
        for (const [key, entry] of this.recent) {
            if (entry.expiresAt <= now) {
                this.recent.delete(key);
            }
        }
    }

    private static makeConsumerName(): string {
        const random = Math.random().toString(36).slice(2, 10);
        const ts = Date.now().toString(36);
        return `${FspiopResponseSubscriber.CONSUMER_NAME_PREFIX}-${ts}-${random}`;
    }
}

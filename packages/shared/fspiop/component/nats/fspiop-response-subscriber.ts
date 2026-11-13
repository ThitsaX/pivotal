// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AckPolicy, ConsumerMessages, DeliverPolicy, JsMsg, ReplayPolicy } from 'nats';
import { NatsClientService } from '@shared/nats';
import { ErrorInformationObject } from '../../dto';
import { FspiopErrors } from '../../exception/fspiop-errors';
import { FspiopException } from '../../exception/fspiop-exception';
import { FspiopPubSubSubjects } from '../fspiop-pub-sub-subjects';
import { FSPIOP_RESPONSE_STREAM_SUBJECT, resolveFspiopResponseStream } from './fspiop-response-stream.resolver';

type PendingEntry = {
    readonly successSubject: string;
    readonly subjects: readonly string[];
    readonly resolve: (payload: unknown) => void;
    readonly reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout> | null;
};

export type Waiter<T> = {
    readonly promise: Promise<T>;
    cancel(): void;
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
 */
export class FspiopResponseSubscriber implements OnModuleInit, OnModuleDestroy {
    static readonly DEFAULT_TIMEOUT_MS = 30_000;
    private static readonly CONSUMER_NAME_PREFIX = 'fspiop-response';

    private readonly logger = new Logger(FspiopResponseSubscriber.name);
    private readonly pending = new Map<string, Set<PendingEntry>>();

    private consumerMessages: ConsumerMessages | null = null;
    private stream: string | null = null;
    private consumerName: string | null = null;
    private running = false;

    constructor(private readonly nats: NatsClientService) {}

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
        const allEntries = new Set<PendingEntry>();
        for (const set of this.pending.values()) {
            for (const entry of set) {
                allEntries.add(entry);
            }
        }
        for (const entry of allEntries) {
            this.remove(entry);
        }
        this.pending.clear();
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
    ): Waiter<T> {
        let entry!: PendingEntry;

        const promise = FspiopResponseSubscriber.guard(
            new Promise<T>((resolve, reject) => {
                entry = {
                    successSubject,
                    subjects: [successSubject, errorSubject, ...(hubErrorSubject ? [hubErrorSubject] : [])],
                    resolve: (payload) => resolve(payload as T),
                    reject,
                    timer: null,
                };

                entry.timer = setTimeout(() => {
                    this.remove(entry);
                    reject(
                        new FspiopException(
                            FspiopErrors.SERVER_TIMED_OUT,
                            `No FSPIOP callback received on '${successSubject}' within ${timeoutMs}ms.`,
                        ),
                    );
                }, timeoutMs);

                for (const subject of entry.subjects) {
                    let set = this.pending.get(subject);
                    if (set == null) {
                        set = new Set();
                        this.pending.set(subject, set);
                    }
                    set.add(entry);
                }
            }),
        );

        return {
            promise,
            cancel: () => this.remove(entry),
        };
    }

    private remove(entry: PendingEntry): void {
        for (const subject of entry.subjects) {
            const set = this.pending.get(subject);
            set?.delete(entry);
            if (set?.size === 0) {
                this.pending.delete(subject);
            }
        }
        if (entry.timer != null) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
    }

    /**
     * Callers register the waiter, then `await` a downstream HTTP request, and only
     * `await` this promise afterwards. The promise can therefore settle (reject) before
     * that final `await` attaches a handler — via dispatch() delivering a callback
     * while the HTTP request is still in flight. With no
     * handler attached, that rejection floats and Node's unhandledRejection guard crashes
     * the process. Attaching a no-op catch marks it handled; the discarded derived promise
     * leaves the original untouched, so the caller's later `await` still observes the result.
     */
    private static guard<T>(promise: Promise<T>): Promise<T> {
        promise.catch(() => undefined);
        return promise;
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
        let matchedSubject = subject;
        let waiters = this.pending.get(matchedSubject);

        if (waiters == null) {
            const anyPayeeSubject = FspiopPubSubSubjects.Parties.toAnyPayeeSubject(subject);
            if (anyPayeeSubject != null) {
                matchedSubject = anyPayeeSubject;
                waiters = this.pending.get(matchedSubject);
            }
        }

        if (waiters == null || waiters.size === 0) {
            return;
        }

        const first = waiters.values().next().value!;
        const isSuccess = matchedSubject === first.successSubject;

        if (isSuccess) {
            for (const entry of Array.from(waiters)) {
                this.remove(entry);
                entry.resolve(payload);
            }
        } else {
            this.remove(first);
            first.reject(FspiopResponseSubscriber.toFspiopException(payload as ErrorInformationObject));
        }
    }

    private static makeConsumerName(): string {
        const random = Math.random().toString(36).slice(2, 10);
        const ts = Date.now().toString(36);
        return `${FspiopResponseSubscriber.CONSUMER_NAME_PREFIX}-${ts}-${random}`;
    }
}

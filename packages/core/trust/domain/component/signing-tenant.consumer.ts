// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleInit} from '@nestjs/common';
import {AckPolicy, ConsumerMessages, DeliverPolicy, JetStreamManager, ReplayPolicy} from 'nats';
import {SigningTenantProvisionedMessage} from '@core/trust/common';
import {NatsClientService, parseMaxAgeMs, resolveStreamWithLimits, UNLIMITED} from '@shared/nats';
import {JwsKeyPublishScheduler} from './jws-key-publish.scheduler';

/**
 * Publishes a newly provisioned tenant's signing key to MCM as soon as it is announced.
 *
 * Onboarding provisions a key and emits an event; this turns that into an MCM registration and
 * switches the tenant's signing on. Doing it here rather than in the onboarding path keeps
 * web-pivotal free of any dependency on MCM being reachable.
 *
 * **This is the fast path, not the only path.** {@link JwsKeyPublishScheduler} still sweeps
 * periodically, and that sweep is what covers the one case a durable stream cannot: onboarding
 * writing the row and then dying before it published anything, so there is no message to redeliver.
 * Neither mechanism alone is sufficient — the event would miss that case, and the sweep alone would
 * leave a new tenant unable to sign until the next pass.
 */
export class SigningTenantConsumer implements OnModuleInit {

    /** Matches `SigningTenantPublisher.SUBJECT`; not imported, to keep the module dependency one-way. */
    static readonly SUBJECT = 'trust.signing-tenant.provisioned';
    static readonly DURABLE = 'trust-consumer-signing-tenant';

    private static readonly DEFAULT_STREAM_NAME = 'PIVOTAL_TRUST';
    private static readonly DEFAULT_STREAM_SUBJECT = 'trust.>';

    /**
     * A week. These events are rare and each one gates a tenant's ability to sign, so the buffer is
     * sized for an outage lasting days rather than for throughput.
     */
    private static readonly DEFAULT_STREAM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

    private readonly logger = new Logger(SigningTenantConsumer.name);

    constructor(
        private readonly nats: NatsClientService,
        private readonly publisher: JwsKeyPublishScheduler,
    ) {
    }

    async onModuleInit(): Promise<void> {

        if (!this.nats.isConnected) {
            this.logger.log(
                'No NATS connection; signing tenants will be published by the periodic reconcile '
                + 'rather than on announcement.',
            );
            return;
        }

        const js = this.nats.nc.jetstream();
        const jsm = await js.jetstreamManager();
        const stream = await this.resolveStream(jsm);

        await this.ensureConsumer(jsm, stream);

        const consumer = await js.consumers.get(stream, SigningTenantConsumer.DURABLE);

        void this.consume(await consumer.consume());

        this.logger.log(`Listening for signing tenants on '${SigningTenantConsumer.SUBJECT}'.`);
    }

    private async resolveStream(jsm: JetStreamManager): Promise<string> {

        return resolveStreamWithLimits(jsm, SigningTenantConsumer.SUBJECT, {
            name: process.env['PIVOTAL_TRUST_STREAM_NAME']
                ?? SigningTenantConsumer.DEFAULT_STREAM_NAME,
            streamSubject: SigningTenantConsumer.DEFAULT_STREAM_SUBJECT,
            maxAgeMs: parseMaxAgeMs(
                process.env['PIVOTAL_TRUST_STREAM_MAX_AGE_MS'],
                SigningTenantConsumer.DEFAULT_STREAM_MAX_AGE_MS),
            maxBytes: UNLIMITED,
        }, this.logger);
    }

    private async ensureConsumer(jsm: JetStreamManager, stream: string): Promise<void> {

        try {
            await jsm.consumers.info(stream, SigningTenantConsumer.DURABLE);

            return;
        } catch (error: unknown) {
            const code = (error as {code?: string}).code;

            if (code !== '404') {
                throw error;
            }
        }

        await jsm.consumers.add(stream, {
            durable_name: SigningTenantConsumer.DURABLE,
            filter_subject: SigningTenantConsumer.SUBJECT,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            replay_policy: ReplayPolicy.Instant,
        });
    }

    private async consume(messages: ConsumerMessages): Promise<void> {

        for await (const msg of messages) {

            const message = this.nats.codec.decode(msg.data) as SigningTenantProvisionedMessage;
            const fspId = message?.fspId?.trim();

            if (fspId == null || fspId.length === 0) {
                // Terminated, not nacked: redelivering a message with no tenant in it will fail
                // identically forever, and a poison message must not block the ones behind it.
                this.logger.warn('Terminating a signing-tenant message that names no tenant.');
                msg.term();
                continue;
            }

            try {
                await this.publisher.publishAndEnable(fspId);
                msg.ack();
            } catch (error: unknown) {
                const detail = error instanceof Error ? error.message : String(error);

                // Nacked so JetStream redelivers. MCM being down is the expected reason to be here,
                // and it is temporary; the alternative — dropping the event — would leave a tenant
                // provisioned but never published, with nothing to show why.
                this.logger.error(
                    `Could not publish signing key for '${fspId}': ${detail}. Will retry.`);
                msg.nak();
            }
        }
    }
}

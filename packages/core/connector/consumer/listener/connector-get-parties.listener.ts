// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleInit} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {AckPolicy, ConsumerMessages, DeliverPolicy, JetStreamManager, ReplayPolicy} from 'nats';
import {FspiopException} from '@shared/fspiop';
import {NatsClientService} from '@shared/nats';
import {MdcContext} from '@shared/foundation';
import {ConnectorSettings, PerformGetPartiesCommand} from '../../domain';
import {ConnectorGetPartiesPublisher} from '../../publisher';
import {resolveFspiopStream} from './fspiop-stream.resolver';

export class ConnectorGetPartiesListener implements OnModuleInit {

    static readonly DURABLE_PREFIX = 'connector-consumer-get-parties';

    private readonly logger = new Logger(ConnectorGetPartiesListener.name);
    private readonly subject: string;
    private readonly durable: string;

    constructor(
        private readonly nats: NatsClientService,
        private readonly commandBus: CommandBus,
        private readonly connectorSettings: ConnectorSettings,
    ) {
        const connectorId = this.connectorSettings.connectorId.trim();
        this.subject = ConnectorGetPartiesPublisher.subjectFor(connectorId);
        this.durable = ConnectorGetPartiesListener.durableFor(connectorId);
    }

    async onModuleInit(): Promise<void> {
        const js = this.nats.nc.jetstream();
        const jsm = await js.jetstreamManager();
        const stream = await resolveFspiopStream(jsm, this.subject);

        await this.ensureConsumer(jsm, stream, this.durable, this.subject);

        const consumer = await js.consumers.get(stream, this.durable);
        const messages = await consumer.consume();

        this.logger.log(`Listening on subject '${this.subject}' with durable '${this.durable}'.`);
        void this.consume(messages);
    }

    private async ensureConsumer(jsm: JetStreamManager, stream: string, durable: string, subject: string): Promise<void> {
        try {
            await jsm.consumers.info(stream, durable);
            return;
        } catch (error) {
            const maybeNatsError = error as {code?: string};
            if (maybeNatsError.code !== '404') {
                this.logger.error(
                    `Failed to inspect consumer for stream='${stream}' durable='${durable}'.`,
                    error instanceof Error ? error.stack : String(error),
                );
                throw error;
            }
        }

        await jsm.consumers.add(stream, {
            durable_name: durable,
            filter_subject: subject,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            replay_policy: ReplayPolicy.Instant,
        });
    }

    private static durableFor(connectorId: string): string {
        const suffix = ConnectorGetPartiesListener.normalizeDurableSegment(connectorId);
        return `${ConnectorGetPartiesListener.DURABLE_PREFIX}-${suffix}`;
    }

    private static normalizeDurableSegment(value: string): string {
        const normalized = value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '-');

        return normalized.length > 0 ? normalized : 'default';
    }

    private async consume(messages: ConsumerMessages): Promise<void> {
        for await (const msg of messages) {
            try {
                const message = this.nats.codec.decode(msg.data) as ConnectorGetPartiesPublisher.Message;
                const idValue = message.subId ? `${message.partyId} ${message.subId}` : message.partyId;
                await MdcContext.run({[MdcContext.ID_VALUE]: idValue}, async () => {
                    await this.commandBus.execute(
                        new PerformGetPartiesCommand(
                            new PerformGetPartiesCommand.Input(
                                message.correlationId,
                                message.payerFsp,
                                message.payeeFsp,
                                message.partyIdType,
                                message.partyId,
                                message.subId,
                            ),
                        ),
                    );

                    msg.ack();});
                } catch (error) {
                    if (error instanceof FspiopException) {
                        msg.ack();
                    } else {
                        this.logger.error(`Failed to process message: ${(error as Error).message}`, (error as Error).stack);
                        msg.nak();
                    }
                }
            }
        }
    }

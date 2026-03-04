import {Logger, OnModuleInit} from '@nestjs/common';
import {AckPolicy, ConsumerMessages, DeliverPolicy, JetStreamManager, ReplayPolicy} from 'nats';
import {FspiopException} from '@shared/fspiop';
import {NatsClientService} from '@shared/nats';
import {InboundConnectorPartiesPublisher} from '../../domain/publisher';
import {FspClient} from '../fsp-client';
import {resolveFspiopStream} from './fspiop-stream.resolver';

export class InboundConnectorPartiesListener implements OnModuleInit {

    static readonly SUBJECT = 'fspiop.*.parties';
    static readonly DURABLE = 'inbound-connector-parties';

    private readonly logger = new Logger(InboundConnectorPartiesListener.name);

    constructor(
        private readonly nats: NatsClientService,
        private readonly fspClient: FspClient,
    ) {}

    async onModuleInit(): Promise<void> {
        const js = this.nats.nc.jetstream();
        const jsm = await js.jetstreamManager();
        const stream = await resolveFspiopStream(jsm, InboundConnectorPartiesListener.SUBJECT);

        await this.ensureConsumer(jsm, stream);

        const consumer = await js.consumers.get(stream, InboundConnectorPartiesListener.DURABLE);
        const messages = await consumer.consume();

        void this.consume(messages);
    }

    private async ensureConsumer(jsm: JetStreamManager, stream: string): Promise<void> {
        try {
            await jsm.consumers.info(stream, InboundConnectorPartiesListener.DURABLE);
            return;
        } catch (error) {
            const maybeNatsError = error as {code?: string};
            if (maybeNatsError.code !== '404') {
                throw error;
            }
        }

        await jsm.consumers.add(stream, {
            durable_name: InboundConnectorPartiesListener.DURABLE,
            filter_subject: InboundConnectorPartiesListener.SUBJECT,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            replay_policy: ReplayPolicy.Instant,
        });
    }

    private async consume(messages: ConsumerMessages): Promise<void> {
        for await (const msg of messages) {
            try {
                const message = this.nats.codec.decode(msg.data) as InboundConnectorPartiesPublisher.Message;
                await this.fspClient.getParties(message);
                msg.ack();
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

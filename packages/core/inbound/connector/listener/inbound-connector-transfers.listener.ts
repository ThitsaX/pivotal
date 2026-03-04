import {Logger, OnModuleInit} from '@nestjs/common';
import {AckPolicy, ConsumerMessages, DeliverPolicy, JetStreamManager, ReplayPolicy} from 'nats';
import {FspiopException} from '@shared/fspiop';
import {NatsClientService} from '@shared/nats';
import {InboundConnectorTransfersPublisher} from '../../domain/publisher';
import {FspClient} from '../fsp-client';
import {resolveFspiopStream} from './fspiop-stream.resolver';

export class InboundConnectorTransfersListener implements OnModuleInit {

    static readonly SUBJECT = 'fspiop.*.transfers';
    static readonly DURABLE = 'inbound-connector-transfers';

    private readonly logger = new Logger(InboundConnectorTransfersListener.name);

    constructor(
        private readonly nats: NatsClientService,
        private readonly fspClient: FspClient,
    ) {}

    async onModuleInit(): Promise<void> {
        const js = this.nats.nc.jetstream();
        const jsm = await js.jetstreamManager();
        const stream = await resolveFspiopStream(jsm, InboundConnectorTransfersListener.SUBJECT);

        await this.ensureConsumer(jsm, stream);

        const consumer = await js.consumers.get(stream, InboundConnectorTransfersListener.DURABLE);
        const messages = await consumer.consume();

        void this.consume(messages);
    }

    private async ensureConsumer(jsm: JetStreamManager, stream: string): Promise<void> {
        try {
            await jsm.consumers.info(stream, InboundConnectorTransfersListener.DURABLE);
            return;
        } catch (error) {
            const maybeNatsError = error as {code?: string};
            if (maybeNatsError.code !== '404') {
                throw error;
            }
        }

        await jsm.consumers.add(stream, {
            durable_name: InboundConnectorTransfersListener.DURABLE,
            filter_subject: InboundConnectorTransfersListener.SUBJECT,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            replay_policy: ReplayPolicy.Instant,
        });
    }

    private async consume(messages: ConsumerMessages): Promise<void> {
        for await (const msg of messages) {
            try {
                const message = this.nats.codec.decode(msg.data) as InboundConnectorTransfersPublisher.Message;
                await this.fspClient.postTransfers(message.request);
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

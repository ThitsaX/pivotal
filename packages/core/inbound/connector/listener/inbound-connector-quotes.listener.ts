import {Logger, OnModuleInit} from '@nestjs/common';
import {AckPolicy, ConsumerMessages, DeliverPolicy, JetStreamManager, ReplayPolicy} from 'nats';
import {FspiopException} from '@shared/fspiop';
import {NatsClientService} from '@shared/nats';
import {InboundConnectorQuotesPublisher} from '../../domain/publisher';
import {FspClient} from '../fsp-client';
import {resolveFspiopStream} from './fspiop-stream.resolver';

export class InboundConnectorQuotesListener implements OnModuleInit {

    static readonly SUBJECT = 'fspiop.*.quotes';
    static readonly DURABLE = 'inbound-connector-quotes';

    private readonly logger = new Logger(InboundConnectorQuotesListener.name);

    constructor(
        private readonly nats: NatsClientService,
        private readonly fspClient: FspClient,
    ) {}

    async onModuleInit(): Promise<void> {
        const js = this.nats.nc.jetstream();
        const jsm = await js.jetstreamManager();
        const stream = await resolveFspiopStream(jsm, InboundConnectorQuotesListener.SUBJECT);

        await this.ensureConsumer(jsm, stream);

        const consumer = await js.consumers.get(stream, InboundConnectorQuotesListener.DURABLE);
        const messages = await consumer.consume();

        void this.consume(messages);
    }

    private async ensureConsumer(jsm: JetStreamManager, stream: string): Promise<void> {
        try {
            await jsm.consumers.info(stream, InboundConnectorQuotesListener.DURABLE);
            return;
        } catch (error) {
            const maybeNatsError = error as {code?: string};
            if (maybeNatsError.code !== '404') {
                throw error;
            }
        }

        await jsm.consumers.add(stream, {
            durable_name: InboundConnectorQuotesListener.DURABLE,
            filter_subject: InboundConnectorQuotesListener.SUBJECT,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            replay_policy: ReplayPolicy.Instant,
        });
    }

    private async consume(messages: ConsumerMessages): Promise<void> {
        for await (const msg of messages) {
            try {
                const message = this.nats.codec.decode(msg.data) as InboundConnectorQuotesPublisher.Message;
                await this.fspClient.postQuotes(message.request);
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

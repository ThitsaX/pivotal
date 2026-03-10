import {Logger, OnModuleInit} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {AckPolicy, ConsumerMessages, DeliverPolicy, JetStreamManager, ReplayPolicy} from 'nats';
import {FspiopException} from '@shared/fspiop';
import {NatsClientService} from '@shared/nats';
import {HandlePostQuotesCommand} from '../../domain';
import {ConnectorPostQuotesPublisher} from '../../publisher';
import {resolveFspiopStream} from './fspiop-stream.resolver';

export class ConnectorPostQuotesListener implements OnModuleInit {

    static readonly SUBJECT = 'fspiop.*.post.quotes';
    static readonly DURABLE = 'connector-consumer-post-quotes';

    private readonly logger = new Logger(ConnectorPostQuotesListener.name);

    constructor(
        private readonly nats: NatsClientService,
        private readonly commandBus: CommandBus,
    ) {}

    async onModuleInit(): Promise<void> {
        const js = this.nats.nc.jetstream();
        const jsm = await js.jetstreamManager();
        const stream = await resolveFspiopStream(jsm, ConnectorPostQuotesListener.SUBJECT);

        await this.ensureConsumer(jsm, stream);

        const consumer = await js.consumers.get(stream, ConnectorPostQuotesListener.DURABLE);
        const messages = await consumer.consume();

        void this.consume(messages);
    }

    private async ensureConsumer(jsm: JetStreamManager, stream: string): Promise<void> {
        try {
            await jsm.consumers.info(stream, ConnectorPostQuotesListener.DURABLE);
            return;
        } catch (error) {
            const maybeNatsError = error as {code?: string};
            if (maybeNatsError.code !== '404') {
                throw error;
            }
        }

        await jsm.consumers.add(stream, {
            durable_name: ConnectorPostQuotesListener.DURABLE,
            filter_subject: ConnectorPostQuotesListener.SUBJECT,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            replay_policy: ReplayPolicy.Instant,
        });
    }

    private async consume(messages: ConsumerMessages): Promise<void> {
        for await (const msg of messages) {
            try {
                const message = this.nats.codec.decode(msg.data) as ConnectorPostQuotesPublisher.Message;

                await this.commandBus.execute(
                    new HandlePostQuotesCommand(
                        new HandlePostQuotesCommand.Input(
                            message.payerFsp,
                            message.payeeFsp,
                            message.correlationId,
                            message.request,
                        ),
                    ),
                );

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

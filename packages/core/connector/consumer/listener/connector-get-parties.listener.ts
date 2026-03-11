import {Logger, OnModuleInit} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {AckPolicy, ConsumerMessages, DeliverPolicy, JetStreamManager, ReplayPolicy} from 'nats';
import {FspiopException} from '@shared/fspiop';
import {NatsClientService} from '@shared/nats';
import {HandleGetPartiesCommand} from '../../domain';
import {ConnectorGetPartiesPublisher} from '../../publisher';
import {resolveFspiopStream} from './fspiop-stream.resolver';

export class ConnectorGetPartiesListener implements OnModuleInit {

    static readonly SUBJECT = 'fspiop.*.get.parties';
    static readonly DURABLE = 'connector-consumer-get-parties';

    private readonly logger = new Logger(ConnectorGetPartiesListener.name);

    constructor(
        private readonly nats: NatsClientService,
        private readonly commandBus: CommandBus,
    ) {}

    async onModuleInit(): Promise<void> {
        const js = this.nats.nc.jetstream();
        const jsm = await js.jetstreamManager();
        const stream = await resolveFspiopStream(jsm, ConnectorGetPartiesListener.SUBJECT);

        await this.ensureConsumer(jsm, stream);

        const consumer = await js.consumers.get(stream, ConnectorGetPartiesListener.DURABLE);
        const messages = await consumer.consume();

        void this.consume(messages);
    }

    private async ensureConsumer(jsm: JetStreamManager, stream: string): Promise<void> {
        try {
            await jsm.consumers.info(stream, ConnectorGetPartiesListener.DURABLE);
            return;
        } catch (error) {
            const maybeNatsError = error as {code?: string};
            if (maybeNatsError.code !== '404') {
                throw error;
            }
        }

        await jsm.consumers.add(stream, {
            durable_name: ConnectorGetPartiesListener.DURABLE,
            filter_subject: ConnectorGetPartiesListener.SUBJECT,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            replay_policy: ReplayPolicy.Instant,
        });
    }

    private async consume(messages: ConsumerMessages): Promise<void> {
        for await (const msg of messages) {
            try {
                const message = this.nats.codec.decode(msg.data) as ConnectorGetPartiesPublisher.Message;

                await this.commandBus.execute(
                    new HandleGetPartiesCommand(
                        new HandleGetPartiesCommand.Input(
                            message.payerFsp,
                            message.payeeFsp,
                            message.partyIdType,
                            message.partyId,
                            message.subId,
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

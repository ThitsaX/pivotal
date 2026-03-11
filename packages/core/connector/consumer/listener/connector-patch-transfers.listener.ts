import {Logger, OnModuleInit} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {AckPolicy, ConsumerMessages, DeliverPolicy, JetStreamManager, ReplayPolicy} from 'nats';
import {FspiopException} from '@shared/fspiop';
import {NatsClientService} from '@shared/nats';
import {HandlePatchTransfersCommand} from '../../domain';
import {ConnectorPatchTransfersPublisher} from '../../publisher';
import {resolveFspiopStream} from './fspiop-stream.resolver';

export class ConnectorPatchTransfersListener implements OnModuleInit {

    static readonly SUBJECT = 'fspiop.*.patch.transfers';
    static readonly DURABLE = 'connector-consumer-patch-transfers';

    private readonly logger = new Logger(ConnectorPatchTransfersListener.name);

    constructor(
        private readonly nats: NatsClientService,
        private readonly commandBus: CommandBus,
    ) {}

    async onModuleInit(): Promise<void> {
        const js = this.nats.nc.jetstream();
        const jsm = await js.jetstreamManager();
        const stream = await resolveFspiopStream(jsm, ConnectorPatchTransfersListener.SUBJECT);

        await this.ensureConsumer(jsm, stream);

        const consumer = await js.consumers.get(stream, ConnectorPatchTransfersListener.DURABLE);
        const messages = await consumer.consume();

        void this.consume(messages);
    }

    private async ensureConsumer(jsm: JetStreamManager, stream: string): Promise<void> {
        try {
            await jsm.consumers.info(stream, ConnectorPatchTransfersListener.DURABLE);
            return;
        } catch (error) {
            const maybeNatsError = error as {code?: string};
            if (maybeNatsError.code !== '404') {
                throw error;
            }
        }

        await jsm.consumers.add(stream, {
            durable_name: ConnectorPatchTransfersListener.DURABLE,
            filter_subject: ConnectorPatchTransfersListener.SUBJECT,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            replay_policy: ReplayPolicy.Instant,
        });
    }

    private async consume(messages: ConsumerMessages): Promise<void> {
        for await (const msg of messages) {
            try {
                const message = this.nats.codec.decode(msg.data) as ConnectorPatchTransfersPublisher.Message;

                await this.commandBus.execute(
                    new HandlePatchTransfersCommand(
                        new HandlePatchTransfersCommand.Input(
                            message.payerFsp,
                            message.payeeFsp,
                            message.transferId,
                            message.response,
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

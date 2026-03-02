import {Logger, OnModuleInit} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {AckPolicy, ConsumerMessages, DeliverPolicy, JetStreamManager, ReplayPolicy} from 'nats';
import {NatsClientService} from '@shared/nats';
import {AuditInboundPartiesCommand} from '../../domain/command';
import {InboundPartiesAuditPublisher} from '../../producer/publisher';
import {resolveAuditStream} from './audit-stream.resolver';

export class InboundPartiesListener implements OnModuleInit {

    static readonly SUBJECT = InboundPartiesAuditPublisher.SUBJECT;
    static readonly DURABLE  = 'audit-consumer-inbound-parties';

    private readonly logger = new Logger(InboundPartiesListener.name);

    constructor(
        private readonly nats: NatsClientService,
        private readonly commandBus: CommandBus,
    ) {}

    async onModuleInit(): Promise<void> {
        const js = this.nats.nc.jetstream();
        const jsm = await js.jetstreamManager();
        const stream = await resolveAuditStream(jsm, InboundPartiesListener.SUBJECT);

        await this.ensureConsumer(jsm, stream);

        const consumer = await js.consumers.get(stream, InboundPartiesListener.DURABLE);
        const messages = await consumer.consume();

        void this.consume(messages);
    }

    private async ensureConsumer(jsm: JetStreamManager, stream: string): Promise<void> {
        try {
            await jsm.consumers.info(stream, InboundPartiesListener.DURABLE);
            return;
        } catch (error) {
            const maybeNatsError = error as {code?: string};
            if (maybeNatsError.code !== '404') {
                throw error;
            }
        }

        await jsm.consumers.add(stream, {
            durable_name: InboundPartiesListener.DURABLE,
            filter_subject: InboundPartiesListener.SUBJECT,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            replay_policy: ReplayPolicy.Instant,
        });
    }

    private async consume(messages: ConsumerMessages): Promise<void> {
        for await (const msg of messages) {
            try {
                const input = this.nats.codec.decode(msg.data) as AuditInboundPartiesCommand.Input;
                await this.commandBus.execute(new AuditInboundPartiesCommand(input));
                msg.ack();
            } catch (error) {
                this.logger.error(`Failed to process message: ${(error as Error).message}`, (error as Error).stack);
                msg.nak();
            }
        }
    }
}

import {Logger, OnModuleInit} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {
    AuditPartiesErrorCommand,
    AuditPartiesRequestCommand,
    AuditPartiesResponseCommand,
    AuditPatchErrorCommand,
    AuditPatchRequestCommand,
    AuditPatchResponseCommand,
    AuditQuotesErrorCommand,
    AuditQuotesRequestCommand,
    AuditQuotesResponseCommand,
    AuditTransfersErrorCommand,
    AuditTransfersRequestCommand,
    AuditTransfersResponseCommand,
} from '@core/audit/domain';
import {AckPolicy, ConsumerMessages, DeliverPolicy, JetStreamManager, ReplayPolicy} from 'nats';
import {NatsClientService} from '@shared/nats';
import {AuditTransactionPublisher} from '../../producer/publisher';
import {resolveAuditStream} from './audit-stream.resolver';

export class AuditTransactionConsumer implements OnModuleInit {

    static readonly SUBJECT = AuditTransactionPublisher.SUBJECT;
    static readonly DURABLE = 'audit-consumer-transaction';

    private readonly logger = new Logger(AuditTransactionConsumer.name);

    constructor(
        private readonly nats: NatsClientService,
        private readonly commandBus: CommandBus,
    ) {
    }

    async onModuleInit(): Promise<void> {
        const js = this.nats.nc.jetstream();
        const jsm = await js.jetstreamManager();
        const stream = await resolveAuditStream(jsm, AuditTransactionConsumer.SUBJECT);

        await this.ensureConsumer(jsm, stream);

        const consumer = await js.consumers.get(stream, AuditTransactionConsumer.DURABLE);
        const messages = await consumer.consume();

        void this.consume(messages);
    }

    private async ensureConsumer(jsm: JetStreamManager, stream: string): Promise<void> {
        try {
            await jsm.consumers.info(stream, AuditTransactionConsumer.DURABLE);

            return;
        } catch (error) {
            const maybeNatsError = error as {code?: string};

            if (maybeNatsError.code !== '404') {
                throw error;
            }
        }

        await jsm.consumers.add(stream, {
            durable_name: AuditTransactionConsumer.DURABLE,
            filter_subject: AuditTransactionConsumer.SUBJECT,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            replay_policy: ReplayPolicy.Instant,
        });
    }

    private async consume(messages: ConsumerMessages): Promise<void> {
        for await (const msg of messages) {
            try {
                const message = this.nats.codec.decode(msg.data) as TransactionMessage;

                await this.dispatch(message);
                msg.ack();
            } catch (error) {
                this.logger.error(`Failed to process message: ${(error as Error).message}`, (error as Error).stack);
                msg.nak();
            }
        }
    }

    private async dispatch(message: TransactionMessage): Promise<void> {
        switch (message.phase) {
            case TransactionMessage.InvocationPhase.Parties:
                await this.dispatchParties(message);

                return;
            case TransactionMessage.InvocationPhase.Quotes:
                await this.dispatchQuotes(message);

                return;
            case TransactionMessage.InvocationPhase.Transfers:
                await this.dispatchTransfers(message);

                return;
            case TransactionMessage.InvocationPhase.Patch:
                await this.dispatchPatch(message);

                return;
            default:
                throw new Error(`Unsupported transaction phase: ${String(message.phase)}`);
        }
    }

    private async dispatchParties(message: TransactionMessage): Promise<void> {
        const content = message.content as TransactionMessage.PartiesContent;

        switch (message.action) {
            case TransactionMessage.InvocationAction.Request:
                await this.commandBus.execute(
                    new AuditPartiesRequestCommand(
                        new AuditPartiesRequestCommand.Input(
                            content.correlationId,
                            content.payerFsp,
                            content.payeeFsp,
                            content.payerIdType ?? null,
                            content.payerId ?? null,
                            content.payerSubId ?? null,
                            content.payeeIdType ?? null,
                            content.payeeId ?? null,
                            content.payeeSubId ?? null,
                            content.transactionInitiatorType ?? null,
                            content.transactionType ?? null,
                            content.subScenario ?? null,
                            message.gateway,
                            content.request ?? null,
                            AuditTransactionConsumer.toOccurredAt(content.occurredAt),
                        ),
                    ),
                );

                return;
            case TransactionMessage.InvocationAction.Response:
                await this.commandBus.execute(
                    new AuditPartiesResponseCommand(
                        new AuditPartiesResponseCommand.Input(
                            content.correlationId,
                            content.payerFsp,
                            content.payeeFsp,
                            content.payerIdType ?? null,
                            content.payerId ?? null,
                            content.payerSubId ?? null,
                            content.payeeIdType ?? null,
                            content.payeeId ?? null,
                            content.payeeSubId ?? null,
                            message.gateway,
                            content.response ?? null,
                            AuditTransactionConsumer.toOccurredAt(content.occurredAt),
                        ),
                    ),
                );

                return;
            case TransactionMessage.InvocationAction.Error:
                await this.commandBus.execute(
                    new AuditPartiesErrorCommand(
                        new AuditPartiesErrorCommand.Input(
                            content.correlationId,
                            content.payerFsp,
                            content.payeeFsp,
                            content.payerIdType ?? null,
                            content.payerId ?? null,
                            content.payerSubId ?? null,
                            content.payeeIdType ?? null,
                            content.payeeId ?? null,
                            content.payeeSubId ?? null,
                            message.gateway,
                            content.error ?? null,
                            AuditTransactionConsumer.toOccurredAt(content.occurredAt),
                        ),
                    ),
                );

                return;
            default:
                throw new Error(`Unsupported parties action: ${String(message.action)}`);
        }
    }

    private async dispatchQuotes(message: TransactionMessage): Promise<void> {
        const content = message.content as TransactionMessage.QuotesContent;

        switch (message.action) {
            case TransactionMessage.InvocationAction.Request:
                await this.commandBus.execute(
                    new AuditQuotesRequestCommand(
                        new AuditQuotesRequestCommand.Input(
                            content.correlationId,
                            content.payerFsp,
                            content.payeeFsp,
                            message.gateway,
                            content.request ?? null,
                            AuditTransactionConsumer.toOccurredAt(content.occurredAt),
                        ),
                    ),
                );

                return;
            case TransactionMessage.InvocationAction.Response:
                await this.commandBus.execute(
                    new AuditQuotesResponseCommand(
                        new AuditQuotesResponseCommand.Input(
                            content.correlationId,
                            content.payerFsp,
                            content.payeeFsp,
                            message.gateway,
                            content.request ?? null,
                            content.response ?? null,
                            AuditTransactionConsumer.toOccurredAt(content.occurredAt),
                        ),
                    ),
                );

                return;
            case TransactionMessage.InvocationAction.Error:
                await this.commandBus.execute(
                    new AuditQuotesErrorCommand(
                        new AuditQuotesErrorCommand.Input(
                            content.correlationId,
                            content.payerFsp,
                            content.payeeFsp,
                            message.gateway,
                            content.request ?? null,
                            content.error ?? null,
                            AuditTransactionConsumer.toOccurredAt(content.occurredAt),
                        ),
                    ),
                );

                return;
            default:
                throw new Error(`Unsupported quotes action: ${String(message.action)}`);
        }
    }

    private async dispatchTransfers(message: TransactionMessage): Promise<void> {
        const content = message.content as TransactionMessage.TransfersContent;

        switch (message.action) {
            case TransactionMessage.InvocationAction.Request:
                await this.commandBus.execute(
                    new AuditTransfersRequestCommand(
                        new AuditTransfersRequestCommand.Input(
                            content.correlationId,
                            content.payerFsp,
                            content.payeeFsp,
                            message.gateway,
                            content.request ?? null,
                            AuditTransactionConsumer.toOccurredAt(content.occurredAt),
                        ),
                    ),
                );

                return;
            case TransactionMessage.InvocationAction.Response:
                await this.commandBus.execute(
                    new AuditTransfersResponseCommand(
                        new AuditTransfersResponseCommand.Input(
                            content.correlationId,
                            content.payerFsp,
                            content.payeeFsp,
                            message.gateway,
                            content.request ?? null,
                            content.response ?? null,
                            AuditTransactionConsumer.toOccurredAt(content.occurredAt),
                        ),
                    ),
                );

                return;
            case TransactionMessage.InvocationAction.Error:
                await this.commandBus.execute(
                    new AuditTransfersErrorCommand(
                        new AuditTransfersErrorCommand.Input(
                            content.correlationId,
                            content.payerFsp,
                            content.payeeFsp,
                            message.gateway,
                            content.request ?? null,
                            content.error ?? null,
                            AuditTransactionConsumer.toOccurredAt(content.occurredAt),
                        ),
                    ),
                );

                return;
            default:
                throw new Error(`Unsupported transfers action: ${String(message.action)}`);
        }
    }

    private async dispatchPatch(message: TransactionMessage): Promise<void> {
        const content = message.content as TransactionMessage.PatchContent;

        switch (message.action) {
            case TransactionMessage.InvocationAction.Request:
                await this.commandBus.execute(
                    new AuditPatchRequestCommand(
                        new AuditPatchRequestCommand.Input(
                            content.correlationId,
                            content.payerFsp,
                            content.payeeFsp,
                            message.gateway,
                            content.request ?? null,
                            AuditTransactionConsumer.toOccurredAt(content.occurredAt),
                        ),
                    ),
                );

                return;
            case TransactionMessage.InvocationAction.Response:
                await this.commandBus.execute(
                    new AuditPatchResponseCommand(
                        new AuditPatchResponseCommand.Input(
                            content.correlationId,
                            content.payerFsp,
                            content.payeeFsp,
                            message.gateway,
                            content.response ?? null,
                            AuditTransactionConsumer.toOccurredAt(content.occurredAt),
                        ),
                    ),
                );

                return;
            case TransactionMessage.InvocationAction.Error:
                await this.commandBus.execute(
                    new AuditPatchErrorCommand(
                        new AuditPatchErrorCommand.Input(
                            content.correlationId,
                            content.payerFsp,
                            content.payeeFsp,
                            message.gateway,
                            content.error ?? null,
                            AuditTransactionConsumer.toOccurredAt(content.occurredAt),
                        ),
                    ),
                );

                return;
            default:
                throw new Error(`Unsupported patch action: ${String(message.action)}`);
        }
    }

    private static toOccurredAt(value: Date | string | null | undefined): Date | null {
        if (value == null) {
            return null;
        }

        return value instanceof Date ? value : new Date(value);
    }
}

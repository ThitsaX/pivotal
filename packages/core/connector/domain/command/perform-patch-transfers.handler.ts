import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {Snowflake} from '@shared/snowflake';
import {PerformPatchTransfersCommand} from './perform-patch-transfers.command';
import {AuditErrorConverter, FspConnector} from '../component';

@CommandHandler(PerformPatchTransfersCommand)
export class PerformPatchTransfersHandler
    implements ICommandHandler<PerformPatchTransfersCommand, PerformPatchTransfersCommand.Output> {
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
    ) {
    }

    async execute(command: PerformPatchTransfersCommand): Promise<PerformPatchTransfersCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, transferId, response} = command.input;
        const id = PerformPatchTransfersHandler.nextAuditId();
        const auditCorrelationId = correlationId ?? id;
        const createdAt = new Date();

        await this.auditPublisher.publish(
            TransactionMessage.request(
                TransactionMessage.InvocationPhase.Patch,
                TransactionMessage.InvocationGateway.Connector,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    request: response,
                    occurredAt: createdAt,
                },
            ),
        );

        try {
            await this.fspConnector.patchTransfers(
                new FspConnector.PatchTransfersInput(payerFsp, payeeFsp, transferId, response),
            );

            await this.auditPublisher.publish(
                TransactionMessage.response(
                    TransactionMessage.InvocationPhase.Patch,
                    TransactionMessage.InvocationGateway.Connector,
                    {
                        correlationId: auditCorrelationId,
                        payerFsp,
                        payeeFsp,
                        response,
                        occurredAt: new Date(),
                    },
                ),
            );
        } catch (error) {
            const patchError = AuditErrorConverter.toFspError(error);

            if (patchError != null) {
                await this.auditPublisher.publish(
                    TransactionMessage.error(
                        TransactionMessage.InvocationPhase.Patch,
                        TransactionMessage.InvocationGateway.Connector,
                        {
                            correlationId: auditCorrelationId,
                            payerFsp,
                            payeeFsp,
                            error: patchError,
                            occurredAt: new Date(),
                        },
                    ),
                );
            }

            throw error;
        }

        return new PerformPatchTransfersCommand.Output();
    }

    private static nextAuditId(): string {
        return PerformPatchTransfersHandler.SNOWFLAKE.nextId().toString();
    }
}

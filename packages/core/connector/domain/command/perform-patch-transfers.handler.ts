import {Inject, Logger} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {FspiopErrors, FspiopException} from '@shared/fspiop';
import {PerformPatchTransfersCommand} from './perform-patch-transfers.command';
import {AuditErrorConverter, FspConnector} from '../component';

@CommandHandler(PerformPatchTransfersCommand)
export class PerformPatchTransfersHandler
    implements ICommandHandler<PerformPatchTransfersCommand, PerformPatchTransfersCommand.Output> {
    private readonly logger = new Logger(PerformPatchTransfersHandler.name);

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
    ) {
    }

    async execute(command: PerformPatchTransfersCommand): Promise<PerformPatchTransfersCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, transferId, response} = command.input;
        const auditCorrelationId = PerformPatchTransfersHandler.resolveCorrelationId(correlationId, transferId);
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
            const message = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : undefined;

            this.logger.error(`patchTransfers callback flow failed for transferId=${transferId}`, stack ?? message);
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

    private static resolveCorrelationId(
        correlationId: string | null,
        ...businessIds: Array<string | null | undefined>
    ): string {
        const businessId = PerformPatchTransfersHandler.firstNonBlank(...businessIds);

        if (businessId != null) {
            return businessId;
        }

        const traceCorrelationId = PerformPatchTransfersHandler.firstNonBlank(correlationId);

        if (traceCorrelationId == null) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'traceparent correlationId or transaction identifier is required',
            );
        }

        return traceCorrelationId;
    }

    private static firstNonBlank(...values: Array<string | null | undefined>): string | null {
        for (const value of values) {
            const normalized = value?.trim();

            if (normalized != null && normalized.length > 0) {
                return normalized;
            }
        }

        return null;
    }
}

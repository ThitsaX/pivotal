import {Inject, Logger} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {FspiopAxios, FspiopErrors, FspiopException, FspiopHeaders,} from '@shared/fspiop';
import {PerformGetPartiesCommand} from './perform-get-parties.command';
import {AuditErrorConverter, ConnectorSettings, FspConnector} from '../component';

@CommandHandler(PerformGetPartiesCommand)
export class PerformGetPartiesHandler
    implements ICommandHandler<PerformGetPartiesCommand, PerformGetPartiesCommand.Output> {
    private readonly logger = new Logger(PerformGetPartiesHandler.name);

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
        @Inject(ConnectorSettings)
        private readonly connectorSettings: ConnectorSettings,
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
    ) {
    }

    async execute(command: PerformGetPartiesCommand): Promise<PerformGetPartiesCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, partyIdType, partyId, subId} = command.input;
        const {partiesUrl} = this.fspiopAxios.settings;
        const createdAt = new Date();
        const auditCorrelationId = PerformGetPartiesHandler.resolveCorrelationId(correlationId);
        const headers = FspiopHeaders.Values.Parties.forResult(
            auditCorrelationId,
            payerFsp,
            this.connectorSettings.connectorId,
        );

        await this.auditPublisher.publish(
            TransactionMessage.request(
                TransactionMessage.InvocationPhase.Parties,
                TransactionMessage.InvocationGateway.Connector,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    payeeIdType: partyIdType,
                    payeeId: partyId,
                    payeeSubId: subId ?? null,
                    occurredAt: createdAt,
                },
            ),
        );

        try {
            const response = await this.fspConnector.getParties(
                partyIdType,
                partyId,
                subId,
            );

            await this.fspiopAxios.putParties(
                partiesUrl,
                headers,
                partyIdType,
                partyId,
                response,
                subId ?? undefined,
            );

            await this.auditPublisher.publish(
                TransactionMessage.response(
                    TransactionMessage.InvocationPhase.Parties,
                    TransactionMessage.InvocationGateway.Connector,
                    {
                        correlationId: auditCorrelationId,
                        payerFsp,
                        payeeFsp,
                        payeeIdType: partyIdType,
                        payeeId: partyId,
                        payeeSubId: subId ?? null,
                        response,
                        occurredAt: new Date(),
                    },
                ),
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : undefined;

            this.logger.error(`getParties callback flow failed for partyId=${partyId}`, stack ?? message);
            let callbackError = error;
            let callbackAuditError = AuditErrorConverter.toAuditError(error);
            let callbackErrorResponse = AuditErrorConverter.toErrorResponse(callbackAuditError);
            let callbackFspError = AuditErrorConverter.toFspError(error);

            try {
                await this.fspiopAxios.putPartiesError(
                    partiesUrl,
                    headers,
                    partyIdType,
                    partyId,
                    callbackErrorResponse,
                    subId ?? undefined,
                );
            } catch (putError) {
                const putMessage = putError instanceof Error ? putError.message : String(putError);
                const putStack = putError instanceof Error ? putError.stack : undefined;

                this.logger.error(`putPartiesError failed for partyId=${partyId}`, putStack ?? putMessage);
                callbackError = putError;
                callbackAuditError = AuditErrorConverter.toAuditError(putError);
                callbackErrorResponse = AuditErrorConverter.toErrorResponse(callbackAuditError);
                callbackFspError = callbackFspError ?? AuditErrorConverter.toFspError(putError);
            }

            try {
                await this.auditPublisher.publish(
                    TransactionMessage.error(
                        TransactionMessage.InvocationPhase.Parties,
                        TransactionMessage.InvocationGateway.Connector,
                        {
                            correlationId: auditCorrelationId,
                            payerFsp,
                            payeeFsp,
                            payeeIdType: partyIdType,
                            payeeId: partyId,
                            payeeSubId: subId ?? null,
                            error: callbackFspError == null
                                ? callbackAuditError
                                : {audit: callbackAuditError, fspError: callbackFspError},
                            occurredAt: new Date(),
                        },
                    ),
                );
            } catch (publishError) {
                const publishMessage = publishError instanceof Error ? publishError.message : String(publishError);
                const publishStack = publishError instanceof Error ? publishError.stack : undefined;

                this.logger.error(`audit publish failed for partyId=${partyId}`, publishStack ?? publishMessage);
                // Preserve the callback error as the command failure.
            }

            FspiopException.rethrow(callbackError);
        }

        return new PerformGetPartiesCommand.Output();
    }

    private static resolveCorrelationId(correlationId: string | null): string {
        if (correlationId == null || correlationId.trim().length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'traceparent correlationId is required',
            );
        }

        return correlationId;
    }
}

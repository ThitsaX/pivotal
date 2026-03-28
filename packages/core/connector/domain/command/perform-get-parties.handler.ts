import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {FspiopAxios, FspiopException, FspiopHeaders,} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {PerformGetPartiesCommand} from './perform-get-parties.command';
import {AuditErrorConverter, ConnectorSettings, FspConnector} from '../component';

@CommandHandler(PerformGetPartiesCommand)
export class PerformGetPartiesHandler
    implements ICommandHandler<PerformGetPartiesCommand, PerformGetPartiesCommand.Output> {
    private static readonly SNOWFLAKE = Snowflake.get();

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
        const headers = FspiopHeaders.Values.Parties.forResult(correlationId, payerFsp, this.connectorSettings.connectorId);
        const createdAt = new Date();
        const id = PerformGetPartiesHandler.nextAuditId();
        const auditCorrelationId = correlationId ?? id;

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
            } catch {
                // Preserve the callback error as the command failure.
            }

            FspiopException.rethrow(callbackError);
        }

        return new PerformGetPartiesCommand.Output();
    }

    private static nextAuditId(): string {
        return PerformGetPartiesHandler.SNOWFLAKE.nextId().toString();
    }
}

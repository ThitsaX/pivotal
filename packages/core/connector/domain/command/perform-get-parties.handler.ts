import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundPartiesCommand} from '@core/audit/domain';
import {InboundPartiesAuditPublisher} from '@core/audit/producer';
import {ErrorInformationObject, ErrorInformationResponse, FspiopAxios, FspiopException, FspiopHeaders,} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {PerformGetPartiesCommand} from './perform-get-parties.command';
import {ConnectorSettings, FspConnector} from '../component';

@CommandHandler(PerformGetPartiesCommand)
export class PerformGetPartiesHandler
    implements ICommandHandler<PerformGetPartiesCommand, PerformGetPartiesCommand.Output> {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
        @Inject(ConnectorSettings)
        private readonly connectorSettings: ConnectorSettings,
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(InboundPartiesAuditPublisher)
        private readonly auditPublisher: InboundPartiesAuditPublisher,
    ) {
    }

    async execute(command: PerformGetPartiesCommand): Promise<PerformGetPartiesCommand.Output> {
        const {payerFsp, payeeFsp, partyIdType, partyId, subId} = command.input;
        const {partiesUrl} = this.fspiopAxios.settings;
        const headers = FspiopHeaders.Values.Parties.forResult(payerFsp, this.connectorSettings.connectorId);
        const createdAt = new Date();
        const id = PerformGetPartiesHandler.nextAuditId();

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
                new AuditInboundPartiesCommand.Input(
                    id,
                    id,
                    PerformGetPartiesHandler.RAIL,
                    payerFsp,
                    payeeFsp,
                    partyIdType,
                    partyId,
                    subId,
                    response,
                    null,
                    null,
                    createdAt,
                    new Date(),
                ),
            );
        } catch (error) {
            let callbackError = error;
            let callbackAuditError = PerformGetPartiesHandler.toAuditError(error);
            let callbackErrorResponse = PerformGetPartiesHandler.toErrorResponse(callbackAuditError);

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
                callbackAuditError = PerformGetPartiesHandler.toAuditError(putError);
                callbackErrorResponse = PerformGetPartiesHandler.toErrorResponse(callbackAuditError);
            }

            try {
                await this.auditPublisher.publish(
                    new AuditInboundPartiesCommand.Input(
                        id,
                        id,
                        PerformGetPartiesHandler.RAIL,
                        payerFsp,
                        payeeFsp,
                        partyIdType,
                        partyId,
                        subId,
                        null,
                        callbackAuditError,
                        null,
                        createdAt,
                        new Date(),
                    ),
                );
            } catch {
                // Preserve the callback error as the command failure.
            }

            FspiopException.rethrow(callbackError);
        }

        return new PerformGetPartiesCommand.Output();
    }

    private static toAuditError(error: unknown): ErrorInformationObject {
        try {
            FspiopException.rethrow(error);
        } catch (normalizedError) {
            return (normalizedError as FspiopException).toErrorObject();
        }
    }

    private static toErrorResponse(error: ErrorInformationObject): ErrorInformationResponse {
        return {errorInformation: error.errorInformation};
    }

    private static nextAuditId(): string {
        return PerformGetPartiesHandler.SNOWFLAKE.nextId().toString();
    }
}

import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundPartiesCommand} from '@core/audit/domain';
import {InboundPartiesAuditPublisher} from '@core/audit/producer';
import {
    ErrorInformationObject,
    ErrorInformationResponse,
    FspiopAxios,
    FspiopException,
    FspiopHeaders,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {HandleGetPartiesCommand} from './handle-get-parties.command';
import {FspConnector} from '../component';

@CommandHandler(HandleGetPartiesCommand)
export class HandleGetPartiesHandler
    implements ICommandHandler<HandleGetPartiesCommand, HandleGetPartiesCommand.Output> {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(InboundPartiesAuditPublisher)
        private readonly auditPublisher: InboundPartiesAuditPublisher,
    ) {
    }

    async execute(command: HandleGetPartiesCommand): Promise<HandleGetPartiesCommand.Output> {
        const {payerFsp, payeeFsp, partyIdType, partyId, subId} = command.input;
        const {switchBaseUrl} = this.fspiopAxios.settings;
        const headers = FspiopHeaders.Values.Parties.forResult(payerFsp, payeeFsp);
        const createdAt = new Date();
        const id = HandleGetPartiesHandler.nextAuditId();

        try {
            const response = await this.fspConnector.getParties(
                partyIdType,
                partyId,
                subId,
            );

            await this.fspiopAxios
                .withHeaders(headers)
                .putParties(switchBaseUrl, partyIdType, partyId, response, subId ?? undefined);

            await this.auditPublisher.publish(
                new AuditInboundPartiesCommand.Input(
                    id,
                    HandleGetPartiesHandler.RAIL,
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
            let callbackAuditError = HandleGetPartiesHandler.toAuditError(error);
            let callbackErrorResponse = HandleGetPartiesHandler.toErrorResponse(callbackAuditError);

            try {
                await this.fspiopAxios
                    .withHeaders(headers)
                    .putPartiesError(switchBaseUrl, partyIdType, partyId, callbackErrorResponse, subId ?? undefined);
            } catch (putError) {
                callbackError = putError;
                callbackAuditError = HandleGetPartiesHandler.toAuditError(putError);
                callbackErrorResponse = HandleGetPartiesHandler.toErrorResponse(callbackAuditError);
            }

            try {
                await this.auditPublisher.publish(
                    new AuditInboundPartiesCommand.Input(
                        id,
                        HandleGetPartiesHandler.RAIL,
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

        return new HandleGetPartiesCommand.Output();
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
        return HandleGetPartiesHandler.SNOWFLAKE.nextId().toString();
    }
}

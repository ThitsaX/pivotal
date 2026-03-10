import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundPartiesCommand} from '@core/audit/domain';
import {InboundPartiesAuditPublisher} from '@core/audit/producer';
import {
    ErrorInformationObject,
    FspiopAxios,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {HandleGetPartiesCommand} from './handle-get-parties.command';
import {FspClient} from '../component';

@CommandHandler(HandleGetPartiesCommand)
export class HandleGetPartiesHandler
    implements ICommandHandler<HandleGetPartiesCommand, HandleGetPartiesCommand.Output> {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        private readonly fspClient: FspClient,
        private readonly fspiopAxios: FspiopAxios,
        private readonly auditPublisher: InboundPartiesAuditPublisher,
    ) {
    }

    async execute(command: HandleGetPartiesCommand): Promise<HandleGetPartiesCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, partyIdType, partyId, subId} = command.input;
        const {switchBaseUrl} = this.fspiopAxios.settings;
        const headers = FspiopHeaders.Values.Parties.forResult(payerFsp, payeeFsp);
        const createdAt = new Date();
        const id = HandleGetPartiesHandler.nextAuditId();

        try {
            const response = await this.fspClient.getParties(
                new FspClient.GetPartiesInput(payerFsp, payeeFsp, correlationId, partyIdType, partyId, subId),
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
                    correlationId,
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

            try {
                await this.fspiopAxios
                    .withHeaders(headers)
                    .putPartiesError(switchBaseUrl, partyIdType, partyId, callbackAuditError, subId ?? undefined);
            } catch (putError) {
                callbackError = putError;
                callbackAuditError = HandleGetPartiesHandler.toAuditError(putError);
            }

            try {
                await this.auditPublisher.publish(
                    new AuditInboundPartiesCommand.Input(
                        id,
                        HandleGetPartiesHandler.RAIL,
                        payerFsp,
                        payeeFsp,
                        correlationId,
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

            throw callbackError;
        }

        return new HandleGetPartiesCommand.Output();
    }

    private static toAuditError(error: unknown): ErrorInformationObject {
        if (error instanceof FspiopException) {
            return error.toErrorObject();
        }

        const message = error instanceof Error
            ? error.message
            : FspiopErrors.INTERNAL_SERVER_ERROR.description;

        return new FspiopException(FspiopErrors.INTERNAL_SERVER_ERROR, message).toErrorObject();
    }

    private static nextAuditId(): string {
        return HandleGetPartiesHandler.SNOWFLAKE.nextId().toString();
    }
}

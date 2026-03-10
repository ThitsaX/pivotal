import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundTransfersCommand} from '@core/audit/domain';
import {InboundTransfersAuditPublisher} from '@core/audit/producer';
import {
    ErrorInformationObject,
    FspiopAxios,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {HandlePostTransfersCommand} from './handle-post-transfers.command';
import {FspClient} from '../component';

@CommandHandler(HandlePostTransfersCommand)
export class HandlePostTransfersHandler
    implements ICommandHandler<HandlePostTransfersCommand, HandlePostTransfersCommand.Output> {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        private readonly fspClient: FspClient,
        private readonly fspiopAxios: FspiopAxios,
        private readonly auditPublisher: InboundTransfersAuditPublisher,
    ) {
    }

    async execute(command: HandlePostTransfersCommand): Promise<HandlePostTransfersCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, request} = command.input;
        const {switchBaseUrl} = this.fspiopAxios.settings;
        const headers = FspiopHeaders.Values.Transfers.forResult(payerFsp, payeeFsp);
        const createdAt = new Date();
        const id = HandlePostTransfersHandler.nextAuditId();

        try {
            const response = await this.fspClient.postTransfers(request);

            await this.fspiopAxios
                .withHeaders(headers)
                .putTransfers(switchBaseUrl, request.transferId, response);

            await this.auditPublisher.publish(
                new AuditInboundTransfersCommand.Input(
                    id,
                    HandlePostTransfersHandler.RAIL,
                    payerFsp,
                    payeeFsp,
                    correlationId,
                    request.transferId,
                    request,
                    response,
                    null,
                    null,
                    createdAt,
                    new Date(),
                ),
            );
        } catch (error) {
            let callbackError = error;
            let callbackAuditError = HandlePostTransfersHandler.toAuditError(error);

            try {
                await this.fspiopAxios
                    .withHeaders(headers)
                    .putTransfersError(switchBaseUrl, request.transferId, callbackAuditError);
            } catch (putError) {
                callbackError = putError;
                callbackAuditError = HandlePostTransfersHandler.toAuditError(putError);
            }

            try {
                await this.auditPublisher.publish(
                    new AuditInboundTransfersCommand.Input(
                        id,
                        HandlePostTransfersHandler.RAIL,
                        payerFsp,
                        payeeFsp,
                        correlationId,
                        request.transferId,
                        request,
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

        return new HandlePostTransfersCommand.Output();
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
        return HandlePostTransfersHandler.SNOWFLAKE.nextId().toString();
    }
}

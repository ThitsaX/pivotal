import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundTransfersCommand} from '@core/audit/domain';
import {InboundTransfersAuditPublisher} from '@core/audit/producer';
import {
    ErrorInformationObject,
    ErrorInformationResponse,
    FspiopAxios,
    FspiopException,
    FspiopHeaders,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {HandlePostTransfersCommand} from './handle-post-transfers.command';
import {FspConnector} from '../component';

@CommandHandler(HandlePostTransfersCommand)
export class HandlePostTransfersHandler
    implements ICommandHandler<HandlePostTransfersCommand, HandlePostTransfersCommand.Output> {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(InboundTransfersAuditPublisher)
        private readonly auditPublisher: InboundTransfersAuditPublisher,
    ) {
    }

    async execute(command: HandlePostTransfersCommand): Promise<HandlePostTransfersCommand.Output> {
        const {payerFsp, payeeFsp, request} = command.input;
        const {transfersUrl} = this.fspiopAxios.settings;
        const headers = FspiopHeaders.Values.Transfers.forResult(payerFsp, payeeFsp);
        const createdAt = new Date();
        const id = HandlePostTransfersHandler.nextAuditId();

        try {
            const response = await this.fspConnector.postTransfers(request);

            await this.fspiopAxios
                .withHeaders(headers)
                .putTransfers(transfersUrl, request.transferId, response);

            await this.auditPublisher.publish(
                new AuditInboundTransfersCommand.Input(
                    id,
                    HandlePostTransfersHandler.RAIL,
                    payerFsp,
                    payeeFsp,
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
            let callbackErrorResponse = HandlePostTransfersHandler.toErrorResponse(callbackAuditError);

            try {
                await this.fspiopAxios
                    .withHeaders(headers)
                    .putTransfersError(transfersUrl, request.transferId, callbackErrorResponse);
            } catch (putError) {
                callbackError = putError;
                callbackAuditError = HandlePostTransfersHandler.toAuditError(putError);
                callbackErrorResponse = HandlePostTransfersHandler.toErrorResponse(callbackAuditError);
            }

            try {
                await this.auditPublisher.publish(
                    new AuditInboundTransfersCommand.Input(
                        id,
                        HandlePostTransfersHandler.RAIL,
                        payerFsp,
                        payeeFsp,
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

            FspiopException.rethrow(callbackError);
        }

        return new HandlePostTransfersCommand.Output();
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
        return HandlePostTransfersHandler.SNOWFLAKE.nextId().toString();
    }
}

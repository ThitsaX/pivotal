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
import {PerformPostTransfersCommand} from './perform-post-transfers.command';
import {ConnectorSettings, FspConnector} from '../component';

@CommandHandler(PerformPostTransfersCommand)
export class PerformPostTransfersHandler
    implements ICommandHandler<PerformPostTransfersCommand, PerformPostTransfersCommand.Output> {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
        @Inject(ConnectorSettings)
        private readonly connectorSettings: ConnectorSettings,
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(InboundTransfersAuditPublisher)
        private readonly auditPublisher: InboundTransfersAuditPublisher,
    ) {
    }

    async execute(command: PerformPostTransfersCommand): Promise<PerformPostTransfersCommand.Output> {
        const {payerFsp, payeeFsp, request} = command.input;
        const {transfersUrl} = this.fspiopAxios.settings;
        const connectorId = this.connectorSettings.connectorId;
        const headers = FspiopHeaders.Values.Transfers.forResult(payerFsp, connectorId);
        const createdAt = new Date();
        const id = PerformPostTransfersHandler.nextAuditId();

        try {
            const response = await this.fspConnector.postTransfers(request);

            await this.fspiopAxios.putTransfers(
                transfersUrl,
                headers,
                request.transferId,
                response,
            );

            await this.auditPublisher.publish(
                new AuditInboundTransfersCommand.Input(
                    id,
                    id,
                    PerformPostTransfersHandler.RAIL,
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
            let callbackAuditError = PerformPostTransfersHandler.toAuditError(error);
            let callbackErrorResponse = PerformPostTransfersHandler.toErrorResponse(callbackAuditError);

            try {
                await this.fspiopAxios.putTransfersError(
                    transfersUrl,
                    headers,
                    request.transferId,
                    callbackErrorResponse,
                );
            } catch (putError) {
                callbackError = putError;
                callbackAuditError = PerformPostTransfersHandler.toAuditError(putError);
                callbackErrorResponse = PerformPostTransfersHandler.toErrorResponse(callbackAuditError);
            }

            try {
                await this.auditPublisher.publish(
                    new AuditInboundTransfersCommand.Input(
                        id,
                        id,
                        PerformPostTransfersHandler.RAIL,
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

        return new PerformPostTransfersCommand.Output();
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
        return PerformPostTransfersHandler.SNOWFLAKE.nextId().toString();
    }
}

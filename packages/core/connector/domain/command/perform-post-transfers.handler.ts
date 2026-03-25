import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundTransfersCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundTransfersAuditPublisher} from '@core/audit/producer';
import {
    FspiopAxios,
    FspiopException,
    FspiopHeaders,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {PerformPostTransfersCommand} from './perform-post-transfers.command';
import {AuditErrorConverter, ConnectorSettings, FspConnector} from '../component';

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
        const {correlationId, payerFsp, payeeFsp, request} = command.input;
        const {transfersUrl} = this.fspiopAxios.settings;
        const connectorId = this.connectorSettings.connectorId;
        const headers = FspiopHeaders.Values.Transfers.forResult(correlationId, payerFsp, connectorId);
        const createdAt = new Date();
        const id = PerformPostTransfersHandler.nextAuditId();
        const auditCorrelationId = correlationId ?? id;

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
                    auditCorrelationId,
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
                    InboundStageEnum.AT_CONNECTOR,
                ),
            );
        } catch (error) {
            let callbackError = error;
            let callbackAuditError = AuditErrorConverter.toAuditError(error);
            let callbackErrorResponse = AuditErrorConverter.toErrorResponse(callbackAuditError);
            let callbackFspError = AuditErrorConverter.toFspError(error);

            try {
                await this.fspiopAxios.putTransfersError(
                    transfersUrl,
                    headers,
                    request.transferId,
                    callbackErrorResponse,
                );
            } catch (putError) {
                callbackError = putError;
                callbackAuditError = AuditErrorConverter.toAuditError(putError);
                callbackErrorResponse = AuditErrorConverter.toErrorResponse(callbackAuditError);
                callbackFspError = callbackFspError ?? AuditErrorConverter.toFspError(putError);
            }

            try {
                await this.auditPublisher.publish(
                    new AuditInboundTransfersCommand.Input(
                        id,
                        auditCorrelationId,
                        PerformPostTransfersHandler.RAIL,
                        payerFsp,
                        payeeFsp,
                        request.transferId,
                        request,
                        null,
                        callbackAuditError,
                        callbackFspError,
                        createdAt,
                        new Date(),
                        InboundStageEnum.AT_CONNECTOR,
                    ),
                );
            } catch {
                // Preserve the callback error as the command failure.
            }

            FspiopException.rethrow(callbackError);
        }

        return new PerformPostTransfersCommand.Output();
    }

    private static nextAuditId(): string {
        return PerformPostTransfersHandler.SNOWFLAKE.nextId().toString();
    }
}

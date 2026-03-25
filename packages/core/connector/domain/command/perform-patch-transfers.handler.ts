import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundTransfersCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundTransfersAuditPublisher} from '@core/audit/producer';
import {Snowflake} from '@shared/snowflake';
import {PerformPatchTransfersCommand} from './perform-patch-transfers.command';
import {AuditErrorConverter, FspConnector} from '../component';

@CommandHandler(PerformPatchTransfersCommand)
export class PerformPatchTransfersHandler
    implements ICommandHandler<PerformPatchTransfersCommand, PerformPatchTransfersCommand.Output> {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
        @Inject(InboundTransfersAuditPublisher)
        private readonly auditPublisher: InboundTransfersAuditPublisher,
    ) {
    }

    async execute(command: PerformPatchTransfersCommand): Promise<PerformPatchTransfersCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, transferId, response} = command.input;
        const id = PerformPatchTransfersHandler.nextAuditId();
        const auditCorrelationId = correlationId ?? id;
        const createdAt = new Date();

        try {
            await this.fspConnector.patchTransfers(
                new FspConnector.PatchTransfersInput(payerFsp, payeeFsp, transferId, response),
            );

            await this.auditPublisher.publish(
                new AuditInboundTransfersCommand.Input(
                    id,
                    auditCorrelationId,
                    PerformPatchTransfersHandler.RAIL,
                    payerFsp,
                    payeeFsp,
                    transferId,
                    null,
                    response,
                    null,
                    null,
                    createdAt,
                    new Date(),
                    InboundStageEnum.AT_CONNECTOR,
                ),
            );
        } catch (error) {
            await this.auditPublisher.publish(
                new AuditInboundTransfersCommand.Input(
                    id,
                    auditCorrelationId,
                    PerformPatchTransfersHandler.RAIL,
                    payerFsp,
                    payeeFsp,
                    transferId,
                    null,
                    null,
                    AuditErrorConverter.toAuditError(error),
                    AuditErrorConverter.toFspError(error),
                    createdAt,
                    new Date(),
                    InboundStageEnum.AT_CONNECTOR,
                ),
            );

            throw error;
        }

        return new PerformPatchTransfersCommand.Output();
    }

    private static nextAuditId(): string {
        return PerformPatchTransfersHandler.SNOWFLAKE.nextId().toString();
    }
}

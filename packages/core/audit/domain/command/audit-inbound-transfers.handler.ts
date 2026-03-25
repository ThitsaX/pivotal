import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {InboundStageEnum, InboundTransfers} from '../model';
import {InboundTransfersRepository} from '../repository';
import {AuditInboundTransfersCommand} from './audit-inbound-transfers.command';

@CommandHandler(AuditInboundTransfersCommand)
export class AuditInboundTransfersHandler
    implements ICommandHandler<AuditInboundTransfersCommand, AuditInboundTransfersCommand.Output> {

    constructor(
        @Inject(InboundTransfersRepository)
        private readonly repository: InboundTransfersRepository,
    ) {
    }

    async execute(command: AuditInboundTransfersCommand): Promise<AuditInboundTransfersCommand.Output> {
        const {id, correlationId, rail, payerFsp, payeeFsp, transferId, request, response, error, fspError, createdAt, completedAt, stage} = command.input;

        const existing = await this.repository.findByCorrelationId(correlationId, DbTarget.Write);

        const finalRequest = request ?? existing?.request ?? null;
        const finalResponse = response ?? existing?.response ?? null;
        const finalError = finalResponse ? null : (error ?? existing?.error ?? null);
        const finalFspError = finalResponse ? null : (fspError ?? existing?.fspError ?? null);
        const failed = finalError !== null || finalFspError !== null;
        const hasCompletionState = finalResponse !== null || finalError !== null || finalFspError !== null;
        const finalCompletedAt = completedAt ?? existing?.completedAt ?? (hasCompletionState ? new Date() : null);
        const finalStage = stage ?? existing?.stage ?? InboundStageEnum.AT_CONNECTOR;

        const entity = new InboundTransfers(
            existing?.id ?? id,
            correlationId,
            rail,
            payerFsp,
            payeeFsp,
            transferId,
            finalRequest,
            finalResponse,
            finalError,
            finalFspError,
            failed,
            existing?.createdAt ?? createdAt ?? new Date(),
            finalCompletedAt,
            finalStage,
        );

        const saved = await this.repository.save(entity);

        return new AuditInboundTransfersCommand.Output(saved.id);
    }
}

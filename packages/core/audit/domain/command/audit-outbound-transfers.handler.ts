import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {OutboundTransfers} from '../model';
import {OutboundTransfersRepository} from '../repository';
import {AuditOutboundTransfersCommand} from './audit-outbound-transfers.command';

@CommandHandler(AuditOutboundTransfersCommand)
export class AuditOutboundTransfersHandler
    implements ICommandHandler<AuditOutboundTransfersCommand, AuditOutboundTransfersCommand.Output> {

    constructor(
        @Inject(OutboundTransfersRepository)
        private readonly repository: OutboundTransfersRepository,
    ) {
    }

    async execute(command: AuditOutboundTransfersCommand): Promise<AuditOutboundTransfersCommand.Output> {
        const {id, correlationId, rail, payerFsp, payeeFsp, transferId, request, response, error, createdAt, completedAt} = command.input;

        const existing = await this.repository.findByCorrelationId(correlationId, DbTarget.Write);

        const finalResponse = response ?? existing?.response ?? null;
        const finalError = finalResponse ? null : (error ?? existing?.error ?? null);
        const failed = finalError !== null;
        const hasCompletionState = finalResponse !== null || finalError !== null;
        const finalCompletedAt = completedAt ?? existing?.completedAt ?? (hasCompletionState ? new Date() : null);

        const entity = new OutboundTransfers(
            existing?.id ?? id,
            correlationId,
            rail,
            payerFsp,
            payeeFsp,
            transferId,
            request,
            finalResponse,
            finalError,
            failed,
            existing?.createdAt ?? createdAt ?? new Date(),
            finalCompletedAt,
        );

        const saved = await this.repository.save(entity);

        return new AuditOutboundTransfersCommand.Output(saved.id);
    }
}

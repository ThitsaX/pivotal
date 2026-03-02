import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {OutboundTransfers} from '../model';
import {OutboundTransfersRepository} from '../repository';
import {AuditOutboundTransfersCommand} from './audit-outbound-transfers.command';

@CommandHandler(AuditOutboundTransfersCommand)
export class AuditOutboundTransfersHandler
    implements ICommandHandler<AuditOutboundTransfersCommand, AuditOutboundTransfersCommand.Output> {

    constructor(private readonly repository: OutboundTransfersRepository) {
    }

    async execute(command: AuditOutboundTransfersCommand): Promise<AuditOutboundTransfersCommand.Output> {
        const {id, rail, payerFsp, payeeFsp, correlationId, transferId, request, response, error, createdAt, completedAt} = command.input;

        const finalResponse = response ?? null;
        const finalError = finalResponse ? null : (error ?? null);
        const failed = finalError !== null;
        const finalCompletedAt = completedAt ?? (finalResponse || finalError ? new Date() : null);

        const entity = new OutboundTransfers(
            id,
            rail,
            payerFsp,
            payeeFsp,
            correlationId,
            transferId,
            request,
            finalResponse,
            finalError,
            failed,
            createdAt ?? new Date(),
            finalCompletedAt,
        );

        const saved = await this.repository.save(entity);

        return new AuditOutboundTransfersCommand.Output(saved.id);
    }
}

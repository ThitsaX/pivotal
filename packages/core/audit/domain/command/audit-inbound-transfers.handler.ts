import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {InboundTransfers} from '../model';
import {InboundTransfersRepository} from '../repository';
import {AuditInboundTransfersCommand} from './audit-inbound-transfers.command';

@CommandHandler(AuditInboundTransfersCommand)
export class AuditInboundTransfersHandler
    implements ICommandHandler<AuditInboundTransfersCommand, AuditInboundTransfersCommand.Output> {

    constructor(private readonly repository: InboundTransfersRepository) {
    }

    async execute(command: AuditInboundTransfersCommand): Promise<AuditInboundTransfersCommand.Output> {
        const {id, rail, payerFsp, payeeFsp, correlationId, transferId, request, response, error, fspError, createdAt, completedAt} = command.input;

        const finalResponse = response ?? null;
        const finalError = finalResponse ? null : (error ?? null);
        const finalFspError = finalResponse ? null : (fspError ?? null);
        const failed = finalError !== null || finalFspError !== null;
        const finalCompletedAt = completedAt ?? (finalResponse || finalError || finalFspError ? new Date() : null);

        const entity = new InboundTransfers(
            id,
            rail,
            payerFsp,
            payeeFsp,
            correlationId,
            transferId,
            request,
            finalResponse,
            finalError,
            finalFspError,
            failed,
            createdAt ?? new Date(),
            finalCompletedAt,
        );

        const saved = await this.repository.save(entity);

        return new AuditInboundTransfersCommand.Output(saved.id);
    }
}

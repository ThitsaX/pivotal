import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {InboundParties} from '../model';
import {InboundPartiesRepository} from '../repository';
import {AuditInboundPartiesCommand} from './audit-inbound-parties.command';

@CommandHandler(AuditInboundPartiesCommand)
export class AuditInboundPartiesHandler
    implements ICommandHandler<AuditInboundPartiesCommand, AuditInboundPartiesCommand.Output> {

    constructor(
        @Inject(InboundPartiesRepository)
        private readonly repository: InboundPartiesRepository,
    ) {
    }

    async execute(command: AuditInboundPartiesCommand): Promise<AuditInboundPartiesCommand.Output> {
        const {id, rail, payerFsp, payeeFsp, correlationId, partyIdType, partyId, subId, response, error, fspError, createdAt, completedAt} = command.input;

        const finalResponse = response ?? null;
        const finalError = finalResponse ? null : (error ?? null);
        const finalFspError = finalResponse ? null : (fspError ?? null);
        const failed = finalError !== null || finalFspError !== null;
        const finalCompletedAt = completedAt ?? (finalResponse || finalError || finalFspError ? new Date() : null);

        const entity = new InboundParties(
            id,
            rail,
            payerFsp,
            payeeFsp,
            correlationId,
            partyIdType,
            partyId,
            subId,
            finalResponse,
            finalError,
            finalFspError,
            failed,
            createdAt ?? new Date(),
            finalCompletedAt,
        );

        const saved = await this.repository.save(entity);

        return new AuditInboundPartiesCommand.Output(saved.id);
    }
}

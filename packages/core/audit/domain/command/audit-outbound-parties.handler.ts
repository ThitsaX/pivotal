import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {OutboundParties} from '../model';
import {OutboundPartiesRepository} from '../repository';
import {AuditOutboundPartiesCommand} from './audit-outbound-parties.command';

@CommandHandler(AuditOutboundPartiesCommand)
export class AuditOutboundPartiesHandler
    implements ICommandHandler<AuditOutboundPartiesCommand, AuditOutboundPartiesCommand.Output> {

    constructor(
        @Inject(OutboundPartiesRepository)
        private readonly repository: OutboundPartiesRepository,
    ) {
    }

    async execute(command: AuditOutboundPartiesCommand): Promise<AuditOutboundPartiesCommand.Output> {
        const {id, rail, payerFsp, payeeFsp, correlationId, partyIdType, partyId, subId, response, error, createdAt, completedAt} = command.input;

        const finalResponse = response ?? null;
        const finalError = finalResponse ? null : (error ?? null);
        const failed = finalError !== null;
        const finalCompletedAt = completedAt ?? (finalResponse || finalError ? new Date() : null);

        const entity = new OutboundParties(
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
            failed,
            createdAt ?? new Date(),
            finalCompletedAt,
        );

        const saved = await this.repository.save(entity);

        return new AuditOutboundPartiesCommand.Output(saved.id);
    }
}

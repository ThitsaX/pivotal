import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
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
        const {id, correlationId, rail, payerFsp, payeeFsp, partyIdType, partyId, subId, response, error, createdAt, completedAt} = command.input;

        const existing = await this.repository.findByCorrelationId(correlationId, DbTarget.Write);

        const finalResponse = response ?? existing?.response ?? null;
        const finalError = finalResponse ? null : (error ?? existing?.error ?? null);
        const failed = finalError !== null;
        const hasCompletionState = finalResponse !== null || finalError !== null;
        const finalCompletedAt = completedAt ?? existing?.completedAt ?? (hasCompletionState ? new Date() : null);

        const entity = new OutboundParties(
            existing?.id ?? id,
            correlationId,
            rail,
            payerFsp,
            payeeFsp,
            partyIdType,
            partyId,
            subId ?? existing?.subId ?? null,
            finalResponse,
            finalError,
            failed,
            existing?.createdAt ?? createdAt ?? new Date(),
            finalCompletedAt,
        );

        const saved = await this.repository.save(entity);

        return new AuditOutboundPartiesCommand.Output(saved.id);
    }
}

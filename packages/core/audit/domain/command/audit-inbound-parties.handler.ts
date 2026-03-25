import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {InboundParties, InboundStageEnum} from '../model';
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
        const {id, correlationId, rail, payerFsp, payeeFsp, partyIdType, partyId, subId, response, error, fspError, createdAt, completedAt, stage} = command.input;

        const existing = await this.repository.findByCorrelationId(correlationId, DbTarget.Write);

        const finalResponse = response ?? existing?.response ?? null;
        const finalError = finalResponse ? null : (error ?? existing?.error ?? null);
        const finalFspError = finalResponse ? null : (fspError ?? existing?.fspError ?? null);
        const failed = finalError !== null || finalFspError !== null;
        const hasCompletionState = finalResponse !== null || finalError !== null || finalFspError !== null;
        const finalCompletedAt = completedAt ?? existing?.completedAt ?? (hasCompletionState ? new Date() : null);
        const finalStage = stage ?? existing?.stage ?? InboundStageEnum.AT_CONNECTOR;

        const entity = new InboundParties(
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
            finalFspError,
            failed,
            existing?.createdAt ?? createdAt ?? new Date(),
            finalCompletedAt,
            finalStage,
        );

        const saved = await this.repository.save(entity);

        return new AuditInboundPartiesCommand.Output(saved.id);
    }
}

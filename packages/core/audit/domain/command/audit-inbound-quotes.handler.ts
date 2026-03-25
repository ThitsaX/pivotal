import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {InboundQuotes, InboundStageEnum} from '../model';
import {InboundQuotesRepository} from '../repository';
import {AuditInboundQuotesCommand} from './audit-inbound-quotes.command';

@CommandHandler(AuditInboundQuotesCommand)
export class AuditInboundQuotesHandler
    implements ICommandHandler<AuditInboundQuotesCommand, AuditInboundQuotesCommand.Output> {

    constructor(
        @Inject(InboundQuotesRepository)
        private readonly repository: InboundQuotesRepository,
    ) {
    }

    async execute(command: AuditInboundQuotesCommand): Promise<AuditInboundQuotesCommand.Output> {
        const {id, correlationId, rail, payerFsp, payeeFsp, quoteId, request, response, error, fspError, createdAt, completedAt, stage} = command.input;

        const existing = await this.repository.findByCorrelationId(correlationId, DbTarget.Write);

        const finalRequest = request ?? existing?.request ?? null;
        const finalResponse = response ?? existing?.response ?? null;
        const finalError = finalResponse ? null : (error ?? existing?.error ?? null);
        const finalFspError = finalResponse ? null : (fspError ?? existing?.fspError ?? null);
        const failed = finalError !== null || finalFspError !== null;
        const hasCompletionState = finalResponse !== null || finalError !== null || finalFspError !== null;
        const finalCompletedAt = completedAt ?? existing?.completedAt ?? (hasCompletionState ? new Date() : null);
        const finalStage = stage ?? existing?.stage ?? InboundStageEnum.AT_CONNECTOR;

        const entity = new InboundQuotes(
            existing?.id ?? id,
            correlationId,
            rail,
            payerFsp,
            payeeFsp,
            quoteId,
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

        return new AuditInboundQuotesCommand.Output(saved.id);
    }
}

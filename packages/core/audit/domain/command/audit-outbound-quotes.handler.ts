import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {OutboundQuotes} from '../model';
import {OutboundQuotesRepository} from '../repository';
import {AuditOutboundQuotesCommand} from './audit-outbound-quotes.command';

@CommandHandler(AuditOutboundQuotesCommand)
export class AuditOutboundQuotesHandler
    implements ICommandHandler<AuditOutboundQuotesCommand, AuditOutboundQuotesCommand.Output> {

    constructor(
        @Inject(OutboundQuotesRepository)
        private readonly repository: OutboundQuotesRepository,
    ) {
    }

    async execute(command: AuditOutboundQuotesCommand): Promise<AuditOutboundQuotesCommand.Output> {
        const {id, correlationId, rail, payerFsp, payeeFsp, quoteId, request, response, error, createdAt, completedAt} = command.input;

        const existing = await this.repository.findByCorrelationId(correlationId, DbTarget.Write);

        const finalResponse = response ?? existing?.response ?? null;
        const finalError = finalResponse ? null : (error ?? existing?.error ?? null);
        const failed = finalError !== null;
        const hasCompletionState = finalResponse !== null || finalError !== null;
        const finalCompletedAt = completedAt ?? existing?.completedAt ?? (hasCompletionState ? new Date() : null);

        const entity = new OutboundQuotes(
            existing?.id ?? id,
            correlationId,
            rail,
            payerFsp,
            payeeFsp,
            quoteId,
            request,
            finalResponse,
            finalError,
            failed,
            existing?.createdAt ?? createdAt ?? new Date(),
            finalCompletedAt,
        );

        const saved = await this.repository.save(entity);

        return new AuditOutboundQuotesCommand.Output(saved.id);
    }
}

import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
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

        const finalResponse = response ?? null;
        const finalError = finalResponse ? null : (error ?? null);
        const failed = finalError !== null;
        const finalCompletedAt = completedAt ?? (finalResponse || finalError ? new Date() : null);

        const entity = new OutboundQuotes(
            id,
            correlationId,
            rail,
            payerFsp,
            payeeFsp,
            quoteId,
            request,
            finalResponse,
            finalError,
            failed,
            createdAt ?? new Date(),
            finalCompletedAt,
        );

        const saved = await this.repository.save(entity);

        return new AuditOutboundQuotesCommand.Output(saved.id);
    }
}

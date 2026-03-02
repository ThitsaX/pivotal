import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {InboundQuotes} from '../model';
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
        const {id, rail, payerFsp, payeeFsp, correlationId, quoteId, request, response, error, fspError, createdAt, completedAt} = command.input;

        const finalResponse = response ?? null;
        const finalError = finalResponse ? null : (error ?? null);
        const finalFspError = finalResponse ? null : (fspError ?? null);
        const failed = finalError !== null || finalFspError !== null;
        const finalCompletedAt = completedAt ?? (finalResponse || finalError || finalFspError ? new Date() : null);

        const entity = new InboundQuotes(
            id,
            rail,
            payerFsp,
            payeeFsp,
            correlationId,
            quoteId,
            request,
            finalResponse,
            finalError,
            finalFspError,
            failed,
            createdAt ?? new Date(),
            finalCompletedAt,
        );

        const saved = await this.repository.save(entity);

        return new AuditInboundQuotesCommand.Output(saved.id);
    }
}

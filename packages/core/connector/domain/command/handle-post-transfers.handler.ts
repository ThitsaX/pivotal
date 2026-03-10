import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundTransfersCommand} from '@core/audit/domain';
import {InboundTransfersAuditPublisher} from '@core/audit/producer';
import {ErrorInformationObject, FspiopErrors, FspiopException} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {HandlePostTransfersCommand} from './handle-post-transfers.command';
import {FspClient} from '../fsp-client';

@CommandHandler(HandlePostTransfersCommand)
export class HandlePostTransfersHandler
    implements ICommandHandler<HandlePostTransfersCommand, HandlePostTransfersCommand.Output> {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        private readonly fspClient: FspClient,
        private readonly auditPublisher: InboundTransfersAuditPublisher,
    ) {
    }

    async execute(command: HandlePostTransfersCommand): Promise<HandlePostTransfersCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, request} = command.input;
        const createdAt = new Date();
        const id = HandlePostTransfersHandler.nextAuditId();

        try {
            const response = await this.fspClient.postTransfers(request);

            await this.auditPublisher.publish(
                new AuditInboundTransfersCommand.Input(
                    id,
                    HandlePostTransfersHandler.RAIL,
                    payerFsp,
                    payeeFsp,
                    correlationId,
                    request.transferId,
                    request,
                    response,
                    null,
                    null,
                    createdAt,
                    new Date(),
                ),
            );
        } catch (error) {
            try {
                await this.auditPublisher.publish(
                    new AuditInboundTransfersCommand.Input(
                        id,
                        HandlePostTransfersHandler.RAIL,
                        payerFsp,
                        payeeFsp,
                        correlationId,
                        request.transferId,
                        request,
                        null,
                        HandlePostTransfersHandler.toAuditError(error),
                        null,
                        createdAt,
                        new Date(),
                    ),
                );
            } finally {
                throw error;
            }
        }

        return new HandlePostTransfersCommand.Output();
    }

    private static toAuditError(error: unknown): ErrorInformationObject {
        if (error instanceof FspiopException) {
            return error.toErrorObject();
        }

        const message = error instanceof Error
            ? error.message
            : FspiopErrors.INTERNAL_SERVER_ERROR.description;

        return new FspiopException(FspiopErrors.INTERNAL_SERVER_ERROR, message).toErrorObject();
    }

    private static nextAuditId(): string {
        return HandlePostTransfersHandler.SNOWFLAKE.nextId().toString();
    }
}

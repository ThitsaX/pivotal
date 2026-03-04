import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {AuditOutboundTransfersCommand} from '@core/audit/domain';
import {OutboundTransfersAuditPublisher} from '@core/audit/producer';
import {DoTransferCommand} from '@core/outbound/domain';
import {
    ErrorInformationObject,
    FspiopErrors,
    FspiopException,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';

@Controller('transfer')
export class TransferController {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        private readonly commandBus: CommandBus,
        private readonly auditPublisher: OutboundTransfersAuditPublisher,
    ) {
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    async transfer(@Body() request: TransferController.Request): Promise<TransferController.Response> {
        const createdAt = new Date();
        const id = TransferController.nextAuditId();

        try {
            const input = new DoTransferCommand.Input(
                request.correlationId,
                request.source,
                request.destination,
                request.transferId,
                request.request,
            );

            const output: DoTransferCommand.Output = await this.commandBus.execute(
                new DoTransferCommand(input),
            );

            await this.auditPublisher.publish(
                new AuditOutboundTransfersCommand.Input(
                    id,
                    TransferController.RAIL,
                    request.source,
                    request.destination,
                    request.correlationId,
                    request.transferId,
                    request.request,
                    output.response,
                    null,
                    createdAt,
                    new Date(),
                ),
            );

            return new TransferController.Response(output.response);
        } catch (error) {
            try {
                await this.auditPublisher.publish(
                    new AuditOutboundTransfersCommand.Input(
                        id,
                        TransferController.RAIL,
                        request.source,
                        request.destination,
                        request.correlationId,
                        request.transferId,
                        request.request,
                        null,
                        TransferController.toAuditError(error),
                        createdAt,
                        new Date(),
                    ),
                );
            } finally {
                throw error;
            }
        }
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
        return TransferController.SNOWFLAKE.nextId().toString();
    }
}

export namespace TransferController {

    export class Request {
        correlationId!: string;
        source!: string;
        destination!: string;
        transferId!: string;
        request!: TransfersPostRequest;
    }

    export class Response {
        constructor(public readonly response: TransfersIDPutResponse) {
        }
    }
}

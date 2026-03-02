import {
    Body,
    Controller,
    HttpCode,
    HttpException,
    HttpStatus,
    Post,
} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {DoTransferCommand} from '@core/outbound/domain';
import {
    FspiopException,
    FspiopStatusTranslator,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '@shared/fspiop';

@Controller('transfer')
export class TransferController {

    constructor(private readonly commandBus: CommandBus) {
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    async transfer(@Body() request: TransferController.Request): Promise<TransferController.Response> {
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

            return new TransferController.Response(output.response);
        } catch (error) {
            TransferController.rethrowAsHttp(error);
        }
    }

    private static rethrowAsHttp(error: unknown): never {
        if (error instanceof HttpException) {
            throw error;
        }

        if (error instanceof FspiopException) {
            throw new HttpException(
                error.toErrorObject(),
                FspiopStatusTranslator.toHttpStatus(error),
            );
        }

        throw error;
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

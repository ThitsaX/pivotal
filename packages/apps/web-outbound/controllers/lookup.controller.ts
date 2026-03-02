import {
    Body,
    Controller,
    HttpCode,
    HttpException,
    HttpStatus,
    Post,
} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {DoLookupCommand} from '@core/outbound/domain';
import {
    FspiopException,
    FspiopStatusTranslator,
    PartiesTypeIDPutResponse,
    PartyIdType,
} from '@shared/fspiop';

@Controller('lookup')
export class LookupController {

    constructor(private readonly commandBus: CommandBus) {
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    async lookup(@Body() request: LookupController.Request): Promise<LookupController.Response> {
        try {
            const input = new DoLookupCommand.Input(
                request.correlationId,
                request.source,
                request.destination,
                request.type,
                request.id,
                request.subId,
            );

            const output: DoLookupCommand.Output = await this.commandBus.execute(
                new DoLookupCommand(input),
            );

            return new LookupController.Response(output.response);
        } catch (error) {
            LookupController.rethrowAsHttp(error);
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

export namespace LookupController {

    export class Request {
        correlationId!: string;
        source!: string;
        destination!: string;
        type!: PartyIdType;
        id!: string;
        subId?: string;
    }

    export class Response {
        constructor(public readonly response: PartiesTypeIDPutResponse) {
        }
    }
}

import {
    Body,
    Controller,
    HttpCode,
    HttpException,
    HttpStatus,
    Post,
} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {DoQuotingCommand} from '@core/outbound/domain';
import {
    FspiopException,
    FspiopStatusTranslator,
    QuotesIDPutResponse,
    QuotesPostRequest,
} from '@shared/fspiop';

@Controller('quote')
export class QuoteController {

    constructor(private readonly commandBus: CommandBus) {
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    async quote(@Body() request: QuoteController.Request): Promise<QuoteController.Response> {
        try {
            const input = new DoQuotingCommand.Input(
                request.correlationId,
                request.source,
                request.destination,
                request.quoteId,
                request.request,
            );

            const output: DoQuotingCommand.Output = await this.commandBus.execute(
                new DoQuotingCommand(input),
            );

            return new QuoteController.Response(output.response);
        } catch (error) {
            QuoteController.rethrowAsHttp(error);
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

export namespace QuoteController {

    export class Request {
        correlationId!: string;
        source!: string;
        destination!: string;
        quoteId!: string;
        request!: QuotesPostRequest;
    }

    export class Response {
        constructor(public readonly response: QuotesIDPutResponse) {
        }
    }
}

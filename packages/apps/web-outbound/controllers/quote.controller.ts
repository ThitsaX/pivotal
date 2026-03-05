import {
    Body,
    Controller,
    Headers,
    HttpCode,
    HttpStatus,
    Post,
} from '@nestjs/common';
import {ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiProperty, ApiTags} from '@nestjs/swagger';
import {CommandBus} from '@nestjs/cqrs';
import {AuditOutboundQuotesCommand} from '@core/audit/domain';
import {OutboundQuotesAuditPublisher} from '@core/audit/producer';
import {DoQuotingCommand} from '@core/outbound/domain';
import {
    ErrorInformationObject,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    QuotesIDPutResponse,
    QuotesPostRequest,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';

export class QuoteRequest {
    @ApiProperty({type: String, description: 'End-to-end correlation ID for the request'})
    correlationId!: string;

    @ApiProperty({type: String, description: 'The FSP ID of the destination (payee FSP)'})
    destination!: string;

    @ApiProperty({type: String, description: 'Unique identifier for this quote'})
    quoteId!: string;

    @ApiProperty({type: () => QuotesPostRequest, description: 'FSPIOP POST /quotes request payload'})
    request!: QuotesPostRequest;
}

export class QuoteResponse {
    @ApiProperty({type: () => QuotesIDPutResponse, description: 'FSPIOP PUT /quotes/{quoteId} response payload'})
    readonly response: QuotesIDPutResponse;

    constructor(response: QuotesIDPutResponse) {
        this.response = response;
    }
}

@ApiTags('Quote')
@Controller('quote')
export class QuoteController {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        private readonly commandBus: CommandBus,
        private readonly auditPublisher: OutboundQuotesAuditPublisher,
    ) {
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({summary: 'Initiate a quoting request via FSPIOP'})
    @ApiHeader({name: FspiopHeaders.Names.FSPIOP_SOURCE, required: true, description: 'The FSP ID of the requester'})
    @ApiBody({type: QuoteRequest})
    @ApiOkResponse({type: QuoteResponse})
    async quote(
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) source: string,
        @Body() request: QuoteRequest,
    ): Promise<QuoteResponse> {
        const createdAt = new Date();
        const id = QuoteController.nextAuditId();

        try {
            const input = new DoQuotingCommand.Input(
                request.correlationId,
                source,
                request.destination,
                request.quoteId,
                request.request,
            );

            const output: DoQuotingCommand.Output = await this.commandBus.execute(
                new DoQuotingCommand(input),
            );

            await this.auditPublisher.publish(
                new AuditOutboundQuotesCommand.Input(
                    id,
                    QuoteController.RAIL,
                    source,
                    request.destination,
                    request.correlationId,
                    request.quoteId,
                    request.request,
                    output.response,
                    null,
                    createdAt,
                    new Date(),
                ),
            );

            return new QuoteResponse(output.response);
        } catch (error) {
            try {
                await this.auditPublisher.publish(
                    new AuditOutboundQuotesCommand.Input(
                        id,
                        QuoteController.RAIL,
                        source,
                        request.destination,
                        request.correlationId,
                        request.quoteId,
                        request.request,
                        null,
                        QuoteController.toAuditError(error),
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
        return QuoteController.SNOWFLAKE.nextId().toString();
    }
}

import {
    Body,
    Controller,
    Headers,
    HttpCode,
    HttpStatus,
    Post,
} from '@nestjs/common';
import {ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiProperty, ApiTags} from '@nestjs/swagger';
import {CommandBus} from '@nestjs/cqrs';
import {AuditOutboundTransfersCommand} from '@core/audit/domain';
import {OutboundTransfersAuditPublisher} from '@core/audit/producer';
import {DoTransferCommand} from '@core/outbound/domain';
import {
    ErrorInformationObject,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {validateAuthorizationHeader} from './authorization-header.util';
import {ApiFspiopErrorResponses} from './fspiop-error-responses.decorator';

export class TransferRequest {
    @ApiProperty({type: String, description: 'End-to-end correlation ID for the request'})
    correlationId!: string;

    @ApiProperty({type: String, description: 'The FSP ID of the destination (payee FSP)'})
    destination!: string;

    @ApiProperty({type: String, description: 'Unique identifier for this transfer'})
    transferId!: string;

    @ApiProperty({type: () => TransfersPostRequest, description: 'FSPIOP POST /transfers request payload'})
    request!: TransfersPostRequest;
}

export class TransferResponse {
    @ApiProperty({type: () => TransfersIDPutResponse, description: 'FSPIOP PUT /transfers/{transferId} response payload'})
    readonly response: TransfersIDPutResponse;

    constructor(response: TransfersIDPutResponse) {
        this.response = response;
    }
}

@ApiTags('Transfer')
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
    @ApiOperation({summary: 'Initiate a transfer via FSPIOP'})
    @ApiHeader({name: FspiopHeaders.Names.FSPIOP_SOURCE, required: true, description: 'The FSP ID of the requester'})
    @ApiHeader({name: 'authorization', required: true, description: 'Bearer RS256 JWT for API authentication'})
    @ApiBearerAuth('authorization')
    @ApiBody({type: TransferRequest})
    @ApiOkResponse({type: TransferResponse})
    @ApiFspiopErrorResponses()
    async transfer(
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) source: string,
        @Headers('authorization') authorization: string | undefined,
        @Body() request: TransferRequest,
    ): Promise<TransferResponse> {
        validateAuthorizationHeader(authorization);

        const createdAt = new Date();
        const id = TransferController.nextAuditId();

        try {
            const input = new DoTransferCommand.Input(
                request.correlationId,
                source,
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
                    source,
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

            return new TransferResponse(output.response);
        } catch (error) {
            try {
                await this.auditPublisher.publish(
                    new AuditOutboundTransfersCommand.Input(
                        id,
                        TransferController.RAIL,
                        source,
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

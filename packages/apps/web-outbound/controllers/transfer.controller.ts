import {
    Body,
    Controller,
    Headers,
    HttpCode,
    HttpStatus,
    Inject,
    Post,
} from '@nestjs/common';
import {ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiProperty, ApiTags} from '@nestjs/swagger';
import {CommandBus} from '@nestjs/cqrs';
import {AuditOutboundTransfersCommand} from '@core/audit/domain';
import {OutboundTransfersAuditPublisher} from '@core/audit/producer';
import {DoTransferCommand} from '@core/outbound/domain';
import {
    ErrorInformationObject,
    ErrorInformationResponse,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    Money,
    TransfersIDPutResponse,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {validateAuthorizationHeader} from './authorization-header.util';
import {ApiFspiopErrorResponses} from './fspiop-error-responses.decorator';

export class TransferRequest {
    @ApiProperty({type: String, description: 'Quote identifier used to derive transfer identifier'})
    quoteId!: string;

    @ApiProperty({type: String, description: 'Payee FSP ID'})
    payeeFsp!: string;

    @ApiProperty({type: () => Money, description: 'Transfer amount'})
    transferAmount!: Money;

    @ApiProperty({type: String, description: 'Information for recipient (transport layer information)'})
    ilpPacket!: string;

    @ApiProperty({type: String, description: 'Condition that must be attached to the transfer by the Payer'})
    condition!: string;

    @ApiProperty({type: String, description: 'Transfer expiration in ISO-8601 datetime format'})
    expiration!: string;
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
    private static readonly FALLBACK_ERROR = FspiopErrors.INTERNAL_SERVER_ERROR.toErrorObject();

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(OutboundTransfersAuditPublisher)
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
        const input = new DoTransferCommand.Input(
            source,
            request,
        );

        try {
            const output: DoTransferCommand.Output = await this.commandBus.execute(
                new DoTransferCommand(input),
            );

            await this.auditPublisher.publish(
                new AuditOutboundTransfersCommand.Input(
                    id,
                    TransferController.RAIL,
                    input.source,
                    input.destination,
                    input.transferId,
                    input.transferRequest,
                    output.callback,
                    null,
                    createdAt,
                    new Date(),
                ),
            );

            return output.response;
        } catch (error) {
            const errorResponse = TransferController.toAuditErrorResponse(error);
            const errorObject = TransferController.toErrorInformationObject(errorResponse);

            try {
                await this.auditPublisher.publish(
                    new AuditOutboundTransfersCommand.Input(
                        id,
                        TransferController.RAIL,
                        input.source,
                        input.destination,
                        input.transferId,
                        input.transferRequest,
                        null,
                        errorObject,
                        createdAt,
                        new Date(),
                    ),
                );
            } finally {
                throw error;
            }
        }
    }

    private static toAuditErrorResponse(error: unknown): ErrorInformationResponse {
        const response = new ErrorInformationResponse();

        if (error instanceof FspiopException) {
            response.errorInformation = error.toErrorObject().errorInformation;
            return response;
        }

        const message = error instanceof Error
            ? error.message
            : FspiopErrors.INTERNAL_SERVER_ERROR.description;

        response.errorInformation = new FspiopException(FspiopErrors.INTERNAL_SERVER_ERROR, message).toErrorObject().errorInformation;
        return response;
    }

    private static toErrorInformationObject(response: ErrorInformationResponse): ErrorInformationObject {
        return {
            errorInformation: response.errorInformation ?? TransferController.FALLBACK_ERROR.errorInformation,
        };
    }

    private static nextAuditId(): string {
        return TransferController.SNOWFLAKE.nextId().toString();
    }
}

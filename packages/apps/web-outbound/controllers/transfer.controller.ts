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
    FspiopErrorTranslator,
    FspiopHeaders,
    Money,
    TransfersIDPutResponse,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {FspiopSigner} from '../component';
import {validateAuthorizationHeader} from './authorization-header.util';
import {ApiFspiopErrorResponses} from './fspiop-error-responses.decorator';

export class TransferRequest {
    @ApiProperty({type: String, description: 'Transaction identifier used to derive transfer identifier'})
    transactionId!: string;

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

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(OutboundTransfersAuditPublisher)
        private readonly auditPublisher: OutboundTransfersAuditPublisher,
        @Inject(FspiopSigner)
        private readonly fspiopSigner: FspiopSigner,
    ) {
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({summary: 'Initiate a transfer via FSPIOP'})
    @ApiHeader({name: FspiopHeaders.Names.FSPIOP_SOURCE, required: true, description: 'The FSP ID of the requester'})
    @ApiHeader({name: 'authorization', required: true, description: 'Bearer RS256 JWT for API authentication'})
    @ApiHeader({name: 'conversion', required: false, description: 'When true, skip FSPIOP call and return generated transfer request'})
    @ApiBearerAuth('authorization')
    @ApiBody({type: TransferRequest})
    @ApiOkResponse({type: TransferResponse})
    @ApiFspiopErrorResponses()
    async transfer(
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) source: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('conversion') conversion: string | undefined,
        @Body() request: TransferRequest,
    ): Promise<TransferResponse | DoTransferCommand.ConversionResponse> {
        validateAuthorizationHeader(authorization);

        const createdAt = new Date();
        const id = TransferController.nextAuditId();
        const commandRequest = TransferController.toCommandRequest(request);
        const input = new DoTransferCommand.Input(
            source,
            commandRequest,
        );

        try {
            if (TransferController.isConversionEnabled(conversion)) {
                await this.auditPublisher.publish(
                    new AuditOutboundTransfersCommand.Input(
                        id,
                        TransferController.RAIL,
                        input.source,
                        input.destination,
                        input.transferId,
                        input.transferRequest,
                        null,
                        null,
                        createdAt,
                        new Date(),
                    ),
                );

                return DoTransferCommand.ConversionResponse.fromInput(
                    input,
                    this.fspiopSigner,
                );
            }

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
            const fspiopException = FspiopErrorTranslator.toFspiopException(error, input.transferId);
            const errorObject = fspiopException.toErrorObject();

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
                throw fspiopException;
            }
        }
    }

    private static nextAuditId(): string {
        return TransferController.SNOWFLAKE.nextId().toString();
    }

    private static isConversionEnabled(conversion: string | undefined): boolean {
        return conversion?.trim().toLowerCase() === 'true';
    }

    private static toCommandRequest(request: TransferRequest): DoTransferCommand.Request {
        return new DoTransferCommand.Request(
            request.transactionId,
            request.payeeFsp,
            request.transferAmount,
            request.ilpPacket,
            request.condition,
            request.expiration,
        );
    }
}

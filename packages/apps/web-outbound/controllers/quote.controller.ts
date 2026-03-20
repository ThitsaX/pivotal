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
import {AuditOutboundQuotesCommand} from '@core/audit/domain';
import {OutboundQuotesAuditPublisher} from '@core/audit/producer';
import {DoQuotingCommand} from '@core/outbound/domain';
import {
    AmountType,
    ExtensionList,
    ErrorInformationObject,
    ErrorInformationResponse,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    Money,
    PartyIdInfo,
    TransactionScenario,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {validateAuthorizationHeader} from './authorization-header.util';
import {ApiFspiopErrorResponses} from './fspiop-error-responses.decorator';

export class QuoteRequest {
    @ApiProperty({enum: TransactionScenario, enumName: 'TransactionScenario', description: 'Transaction scenario'})
    scenario!: TransactionScenario;

    @ApiProperty({type: String, required: false, description: 'Transaction sub-scenario'})
    subScenario?: string;

    @ApiProperty({enum: AmountType, enumName: 'AmountType', description: 'Requested amount type'})
    amountType!: AmountType;

    @ApiProperty({type: () => Money, description: 'Requested amount'})
    amount!: Money;

    @ApiProperty({type: () => PartyIdInfo, description: 'Payer party identity'})
    payer!: PartyIdInfo;

    @ApiProperty({type: () => PartyIdInfo, description: 'Payee party identity'})
    payee!: PartyIdInfo;

    @ApiProperty({type: () => Money, required: false, description: 'Optional payer-side FSP fee'})
    payerFspFee?: Money;

    @ApiProperty({type: () => ExtensionList, required: false, description: 'Optional quote extensions to forward to the payee DFSP'})
    extensionList?: ExtensionList;
}

export class QuoteResponse {
    @ApiProperty({type: String, description: 'Generated quote identifier'})
    readonly quoteId: string;

    @ApiProperty({type: () => Money})
    readonly transferAmount: Money;

    @ApiProperty({type: () => Money})
    readonly payeeReceiveAmount: Money;

    @ApiProperty({type: () => Money})
    readonly schemeFeeAmount: Money;

    @ApiProperty({type: () => Money})
    readonly payeeFspFee: Money;

    @ApiProperty({type: () => Money})
    readonly payeeFspCommission: Money;

    @ApiProperty({type: String})
    readonly ilpPacket: string;

    @ApiProperty({type: String})
    readonly condition: string;

    @ApiProperty({type: String})
    readonly expiration: string;

    @ApiProperty({type: () => ExtensionList})
    readonly extensionList: ExtensionList;

    constructor(
        quoteId: string,
        transferAmount: Money,
        payeeReceiveAmount: Money,
        schemeFeeAmount: Money,
        payeeFspFee: Money,
        payeeFspCommission: Money,
        ilpPacket: string,
        condition: string,
        expiration: string,
        extensionList: ExtensionList,
    ) {
        this.quoteId = quoteId;
        this.transferAmount = transferAmount;
        this.payeeReceiveAmount = payeeReceiveAmount;
        this.schemeFeeAmount = schemeFeeAmount;
        this.payeeFspFee = payeeFspFee;
        this.payeeFspCommission = payeeFspCommission;
        this.ilpPacket = ilpPacket;
        this.condition = condition;
        this.expiration = expiration;
        this.extensionList = extensionList;
    }
}

@ApiTags('Quote')
@Controller('quote')
export class QuoteController {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();
    private static readonly FALLBACK_ERROR = FspiopErrors.INTERNAL_SERVER_ERROR.toErrorObject();

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(OutboundQuotesAuditPublisher)
        private readonly auditPublisher: OutboundQuotesAuditPublisher,
    ) {
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({summary: 'Initiate a quoting request via FSPIOP'})
    @ApiHeader({name: FspiopHeaders.Names.FSPIOP_SOURCE, required: true, description: 'The FSP ID of the requester'})
    @ApiHeader({name: 'authorization', required: true, description: 'Bearer RS256 JWT for API authentication'})
    @ApiBearerAuth('authorization')
    @ApiBody({type: QuoteRequest})
    @ApiOkResponse({type: QuoteResponse})
    @ApiFspiopErrorResponses()
    async quote(
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) source: string,
        @Headers('authorization') authorization: string | undefined,
        @Body() request: QuoteRequest,
    ): Promise<QuoteResponse> {
        validateAuthorizationHeader(authorization);

        const createdAt = new Date();
        const id = QuoteController.nextAuditId();
        const input = new DoQuotingCommand.Input(
            source,
            request,
        );

        try {
            const output: DoQuotingCommand.Output = await this.commandBus.execute(
                new DoQuotingCommand(input),
            );

            await this.auditPublisher.publish(
                new AuditOutboundQuotesCommand.Input(
                    id,
                    QuoteController.RAIL,
                    source,
                    input.destination,
                    input.quoteId,
                    input.quoteRequest,
                    output.callback,
                    null,
                    createdAt,
                    new Date(),
                ),
            );

            return output.response;
        } catch (error) {
            const errorResponse = QuoteController.toAuditErrorResponse(error);
            const errorObject = QuoteController.toErrorInformationObject(errorResponse);

            try {
                await this.auditPublisher.publish(
                    new AuditOutboundQuotesCommand.Input(
                        id,
                        QuoteController.RAIL,
                        source,
                        input.destination,
                        input.quoteId,
                        input.quoteRequest,
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
            errorInformation: response.errorInformation ?? QuoteController.FALLBACK_ERROR.errorInformation,
        };
    }

    private static nextAuditId(): string {
        return QuoteController.SNOWFLAKE.nextId().toString();
    }
}

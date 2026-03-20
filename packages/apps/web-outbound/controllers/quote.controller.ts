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
    FspiopErrorTranslator,
    FspiopHeaders,
    Money,
    PartyIdInfo,
    TransactionScenario,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {FspiopSigner} from '../component';
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
    @ApiProperty({type: String, description: 'Generated transaction identifier'})
    readonly quoteId: string;

    @ApiProperty({type: () => Money})
    readonly transferAmount: Money;

    @ApiProperty({type: () => Money})
    readonly payeeReceiveAmount: Money;

    @ApiProperty({type: () => Money})
    readonly schemeFeeAmount: Money;

    @ApiProperty({type: String})
    readonly ilpPacket: string;

    @ApiProperty({type: String})
    readonly condition: string;

    @ApiProperty({type: String})
    readonly expiration: string;

    @ApiProperty({type: () => ExtensionList})
    readonly extensionList: ExtensionList;

    constructor(
        transactionId: string,
        transferAmount: Money,
        payeeReceiveAmount: Money,
        schemeFeeAmount: Money,
        ilpPacket: string,
        condition: string,
        expiration: string,
        extensionList: ExtensionList,
    ) {
        this.quoteId = transactionId;
        this.transferAmount = transferAmount;
        this.payeeReceiveAmount = payeeReceiveAmount;
        this.schemeFeeAmount = schemeFeeAmount;
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

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(OutboundQuotesAuditPublisher)
        private readonly auditPublisher: OutboundQuotesAuditPublisher,
        @Inject(FspiopSigner)
        private readonly fspiopSigner: FspiopSigner,
    ) {
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({summary: 'Initiate a quoting request via FSPIOP'})
    @ApiHeader({name: FspiopHeaders.Names.FSPIOP_SOURCE, required: true, description: 'The FSP ID of the requester'})
    @ApiHeader({name: 'authorization', required: true, description: 'Bearer RS256 JWT for API authentication'})
    @ApiHeader({name: 'myog', required: false, description: 'When true, skip FSPIOP call and return generated quote request'})
    @ApiBearerAuth('authorization')
    @ApiBody({type: QuoteRequest})
    @ApiOkResponse({type: QuoteResponse})
    @ApiFspiopErrorResponses()
    async quote(
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) source: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('myog') conversion: string | undefined,
        @Body() request: QuoteRequest,
    ): Promise<QuoteResponse | DoQuotingCommand.ConversionResponse> {
        validateAuthorizationHeader(authorization);

        const createdAt = new Date();
        const id = QuoteController.nextAuditId();
        const input = new DoQuotingCommand.Input(
            source,
            request,
        );

        try {
            if (QuoteController.isConversionEnabled(conversion)) {
                await this.auditPublisher.publish(
                    new AuditOutboundQuotesCommand.Input(
                        id,
                        QuoteController.RAIL,
                        input.source,
                        input.destination,
                        input.quoteId,
                        input.quoteRequest,
                        null,
                        null,
                        createdAt,
                        new Date(),
                    ),
                );

                return DoQuotingCommand.ConversionResponse.fromInput(
                    input,
                    this.fspiopSigner,
                );
            }

            const output: DoQuotingCommand.Output = await this.commandBus.execute(
                new DoQuotingCommand(input),
            );

            await this.auditPublisher.publish(
                new AuditOutboundQuotesCommand.Input(
                    id,
                    QuoteController.RAIL,
                    input.source,
                    input.destination,
                    input.quoteId,
                    input.quoteRequest,
                    output.callback,
                    null,
                    createdAt,
                    new Date(),
                ),
            );

            return QuoteController.toQuoteResponse(output.response);
        } catch (error) {
            const fspiopException = FspiopErrorTranslator.toFspiopException(error, input.quoteId);
            const errorObject = fspiopException.toErrorObject();

            try {
                await this.auditPublisher.publish(
                    new AuditOutboundQuotesCommand.Input(
                        id,
                        QuoteController.RAIL,
                        input.source,
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
                throw fspiopException;
            }
        }
    }

    private static nextAuditId(): string {
        return QuoteController.SNOWFLAKE.nextId().toString();
    }

    private static isConversionEnabled(conversion: string | undefined): boolean {
        return conversion?.trim().toLowerCase() === 'true';
    }

    private static toQuoteResponse(response: DoQuotingCommand.Response): QuoteResponse {
        return new QuoteResponse(
            response.quoteId,
            response.transferAmount,
            response.payeeReceiveAmount,
            response.schemeFeeAmount,
            response.ilpPacket,
            response.condition,
            response.expiration,
            response.extensionList,
        );
    }
}

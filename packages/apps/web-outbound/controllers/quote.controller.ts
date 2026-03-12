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
    Currency,
    ExtensionList,
    ErrorInformationObject,
    ErrorInformationResponse,
    FspiopCurrencies,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    FspiopMoney,
    Money,
    Party,
    PartyIdInfo,
    QuotesIDPutResponse,
    QuotesPostRequest,
    TransactionInitiator,
    TransactionInitiatorType,
    TransactionScenario,
    TransactionType,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {Ulid} from '@shared/ulid';
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
}

export class QuoteResponse {
    @ApiProperty({type: String, description: 'Generated quote identifier'})
    readonly quoteId: string;

    @ApiProperty({type: () => Money})
    readonly transferAmount: Money;

    @ApiProperty({type: () => Money})
    readonly payeeReceiveAmount: Money;

    @ApiProperty({type: () => Money})
    readonly payerPayAmount: Money;

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
        payerPayAmount: Money,
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
        this.payerPayAmount = payerPayAmount;
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
        const destination = QuoteController.toDestination(request.payee);
        const quoteRequest = QuoteController.toQuotesPostRequest(request);

        try {
            const input = new DoQuotingCommand.Input(
                source,
                destination,
                quoteRequest.quoteId,
                quoteRequest,
            );

            const output: DoQuotingCommand.Output = await this.commandBus.execute(
                new DoQuotingCommand(input),
            );

            await this.auditPublisher.publish(
                new AuditOutboundQuotesCommand.Input(
                    id,
                    QuoteController.RAIL,
                    source,
                    destination,
                    quoteRequest.quoteId,
                    quoteRequest,
                    output.response,
                    null,
                    createdAt,
                    new Date(),
                ),
            );

            return QuoteController.toQuoteResponse(quoteRequest.quoteId, output.response);
        } catch (error) {
            const errorResponse = QuoteController.toAuditErrorResponse(error);
            const errorObject = QuoteController.toErrorInformationObject(errorResponse);

            try {
                await this.auditPublisher.publish(
                    new AuditOutboundQuotesCommand.Input(
                        id,
                        QuoteController.RAIL,
                        source,
                        destination,
                        quoteRequest.quoteId,
                        quoteRequest,
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

    private static toDestination(payee: PartyIdInfo | undefined): string {
        const destination = payee?.fspId?.trim();

        if (destination == null || destination.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'payee.fspId is required to resolve destination FSP',
            );
        }

        return destination;
    }

    private static toQuotesPostRequest(request: QuoteRequest): QuotesPostRequest {

        const quoteRequest = new QuotesPostRequest();

        FspiopMoney.validate(request.amount);
        FspiopMoney.validate(request.payerFspFee);

        const quoteId = Ulid.generate();

        quoteRequest.quoteId = quoteId;
        quoteRequest.transactionId = quoteId;
        quoteRequest.amountType = request.amountType;
        quoteRequest.amount = request.amount;
        quoteRequest.payer = QuoteController.toParty(request.payer);
        quoteRequest.payee = QuoteController.toParty(request.payee);
        quoteRequest.fees = request.payerFspFee;
        quoteRequest.transactionType = QuoteController.toTransactionType(request.scenario, request.subScenario);

        return quoteRequest;
    }

    private static toParty(partyIdInfo: PartyIdInfo | undefined): Party {

        if (partyIdInfo == null) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'payer and payee are required',
            );
        }

        const party = new Party();
        party.partyIdInfo = partyIdInfo;

        return party;
    }

    private static toTransactionType(
        scenario: TransactionScenario | undefined,
        subScenario: string | undefined,
    ): TransactionType {

        if (scenario == null) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'transactionType is required',
            );
        }

        const transactionType = new TransactionType();
        transactionType.scenario = scenario;
        transactionType.initiator = TransactionInitiator.Payer;
        transactionType.initiatorType = TransactionInitiatorType.Consumer;

        const normalizedSubScenario = subScenario?.trim();

        if (normalizedSubScenario != null && normalizedSubScenario.length > 0) {
            transactionType.subScenario = normalizedSubScenario;
        }

        return transactionType;
    }

    private static toQuoteResponse(quoteId: string, response: QuotesIDPutResponse): QuoteResponse {

        const transferAmount = response.transferAmount;

        if (transferAmount == null) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'transferAmount is required',
            );
        }

        const currencyProfile = FspiopCurrencies.get(transferAmount.currency);

        if (currencyProfile == null) {
            throw new FspiopException(
                FspiopErrors.PAYEE_UNSUPPORTED_CURRENCY,
                `Unsupported currency ${transferAmount.currency}`,
            );
        }

        const extensionList = QuoteController.toExtensionList(response.extensionList);
        const schemeFeeAmount = QuoteController.toSchemeFeeAmount(extensionList, transferAmount.currency, currencyProfile.scale);
        const payerPayAmount = QuoteController.toPayerPayAmount(transferAmount, schemeFeeAmount, currencyProfile.scale);
        const payeeReceiveAmount = response.payeeReceiveAmount ?? transferAmount;
        const payeeFspFee = response.payeeFspFee ?? QuoteController.toZeroMoney(transferAmount.currency);
        const payeeFspCommission = response.payeeFspCommission ?? QuoteController.toZeroMoney(transferAmount.currency);

        return new QuoteResponse(
            quoteId,
            transferAmount,
            payeeReceiveAmount,
            payerPayAmount,
            schemeFeeAmount,
            payeeFspFee,
            payeeFspCommission,
            response.ilpPacket,
            response.condition,
            response.expiration,
            extensionList,
        );
    }

    private static toExtensionList(extensionList: ExtensionList | undefined): ExtensionList {

        const normalizedExtensionList = new ExtensionList();
        normalizedExtensionList.extension = extensionList?.extension ?? [];

        return normalizedExtensionList;
    }

    private static toSchemeFeeAmount(
        extensionList: ExtensionList,
        currency: Currency,
        scale: number,
    ): Money {

        let schemeFee = 0n;

        for (const extension of extensionList.extension) {
            const key = extension.key?.trim().toLowerCase() ?? '';

            if (!key.endsWith('_fee')) {
                continue;
            }

            const value = extension.value?.trim() ?? '0';
            schemeFee += FspiopMoney.serialize(value, scale);
        }

        return QuoteController.toMoney(currency, FspiopMoney.deserialize(schemeFee, scale));
    }

    private static toPayerPayAmount(transferAmount: Money, schemeFeeAmount: Money, scale: number): Money {

        const transferAmountMinor = FspiopMoney.serialize(transferAmount.amount, scale);
        const schemeFeeMinor = FspiopMoney.serialize(schemeFeeAmount.amount, scale);
        const payerPayAmountMinor = transferAmountMinor + schemeFeeMinor;

        return QuoteController.toMoney(
            transferAmount.currency,
            FspiopMoney.deserialize(payerPayAmountMinor, scale),
        );
    }

    private static toMoney(currency: Currency, amount: string): Money {

        const money = new Money();
        money.currency = currency;
        money.amount = amount;

        return money;
    }

    private static toZeroMoney(currency: Currency): Money {
        return QuoteController.toMoney(currency, '0');
    }
}

import {Body, Controller, Headers, Inject, Param, Post, Put} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {AuditOutboundPartiesCommand, AuditOutboundQuotesCommand, AuditOutboundTransfersCommand,} from '@core/audit/domain';
import {OutboundPartiesAuditPublisher, OutboundQuotesAuditPublisher, OutboundTransfersAuditPublisher,} from '@core/audit/producer';
import {PostSendMoneyCommand, PutAcceptPartyCommand, PutAcceptQuoteCommand, RedisClient, SendMoneyRequest, SendMoneyResponse, TransferRequest,} from '@core/outbound/domain';
import {
    FspiopErrors,
    FspiopErrorTranslator,
    FspiopException,
    FspiopHeaders,
    Money,
    Party,
    QuotesPostRequest,
    TransactionInitiator,
    TransactionInitiatorType,
    TransactionType,
    TransfersPostRequest,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';

class PutSendMoneyRequest {
    acceptParty?: boolean;

    acceptQuote?: boolean;
}

@Controller('secured/sendmoney')
export class SendMoneyController {

    private static readonly RAIL = 'fspiop';

    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(OutboundPartiesAuditPublisher)
        private readonly outboundPartiesAuditPublisher: OutboundPartiesAuditPublisher,
        @Inject(OutboundQuotesAuditPublisher)
        private readonly outboundQuotesAuditPublisher: OutboundQuotesAuditPublisher,
        @Inject(OutboundTransfersAuditPublisher)
        private readonly outboundTransfersAuditPublisher: OutboundTransfersAuditPublisher,
        @Inject(RedisClient)
        private readonly redisClient: RedisClient,
    ) {
    }

    private static nextAuditId(): string {
        return SendMoneyController.SNOWFLAKE.nextId().toString();
    }

    private static toOptionalValue(value: string | undefined): string | undefined {
        const normalizedValue = value?.trim();

        return normalizedValue == null || normalizedValue.length === 0
            ? undefined
            : normalizedValue;
    }

    private static toSource(source: string | undefined, request: SendMoneyRequest): string {
        const normalizedSource = source?.trim();

        if (normalizedSource != null && normalizedSource.length > 0) {
            return normalizedSource;
        }

        const payerFsp = request.from?.fspId?.trim();

        if (payerFsp == null || payerFsp.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'fspiop-source header or request.from.fspId is required.',
            );
        }

        return payerFsp;
    }

    private static getFspId(party: Party | undefined, label: string): string {
        const fspId = party?.partyIdInfo?.fspId?.trim();

        if (fspId == null || fspId.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                `${label}.partyIdInfo.fspId is required.`,
            );
        }

        return fspId;
    }

    private static toMoney(transferRequest: TransferRequest): Money {
        const money = new Money();
        money.currency = transferRequest.currency;
        money.amount = transferRequest.amount;

        return money;
    }

    private static toTransactionType(transferRequest: TransferRequest): TransactionType {
        const transactionType = new TransactionType();
        transactionType.scenario = transferRequest.transactionType;
        transactionType.subScenario = SendMoneyController.toOptionalValue(transferRequest.subScenario);
        transactionType.initiator = TransactionInitiator.Payer;
        transactionType.initiatorType = transferRequest.from.type ?? TransactionInitiatorType.Consumer;

        return transactionType;
    }

    private static toQuotesPostRequest(
        transferId: string,
        transferRequest: TransferRequest,
    ): QuotesPostRequest {
        const quoteRequest = new QuotesPostRequest();
        quoteRequest.quoteId = transferId;
        quoteRequest.transactionId = transferId;
        quoteRequest.transactionRequestId = transferId;
        quoteRequest.payee = transferRequest.payee;
        quoteRequest.payer = transferRequest.payer;
        quoteRequest.amountType = transferRequest.amountType;
        quoteRequest.amount = SendMoneyController.toMoney(transferRequest);
        quoteRequest.transactionType = SendMoneyController.toTransactionType(transferRequest);
        quoteRequest.note = transferRequest.note;

        return quoteRequest;
    }

    private static toTransfersPostRequest(
        transferId: string,
        transferRequest: TransferRequest,
    ): TransfersPostRequest {
        const quotes = transferRequest.quotes;

        if (quotes == null) {
            throw new FspiopException(
                FspiopErrors.QUOTE_ID_NOT_FOUND,
                `Quote was not found for transfer ${transferId}.`,
            );
        }

        const transfersPostRequest = new TransfersPostRequest();
        transfersPostRequest.transferId = transferId;
        transfersPostRequest.payerFsp = SendMoneyController.getFspId(transferRequest.payer, 'payer');
        transfersPostRequest.payeeFsp = SendMoneyController.getFspId(transferRequest.payee, 'payee');
        transfersPostRequest.amount = quotes.transferAmount;
        transfersPostRequest.ilpPacket = quotes.ilpPacket;
        transfersPostRequest.condition = quotes.condition;
        transfersPostRequest.expiration = quotes.expiration;
        transfersPostRequest.extensionList = quotes.extensionList;

        return transfersPostRequest;
    }

    @Post()
    async post(
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) source: string,
        @Body() request: SendMoneyRequest,
    ): Promise<SendMoneyResponse> {
        const createdAt = new Date();
        const id = SendMoneyController.nextAuditId();
        const payerFsp = SendMoneyController.toSource(source, request);
        const input = new PostSendMoneyCommand.Input(payerFsp, request);

        try {
            const output: PostSendMoneyCommand.Output = await this.commandBus.execute(
                new PostSendMoneyCommand(input),
            );

            await this.outboundPartiesAuditPublisher.publish(
                new AuditOutboundPartiesCommand.Input(
                    id,
                    output.response.transferId,
                    SendMoneyController.RAIL,
                    payerFsp,
                    request.to.fspId,
                    request.to.idType,
                    request.to.idValue,
                    SendMoneyController.toOptionalValue(request.to.idSubValue),
                    output.callback,
                    null,
                    createdAt,
                    new Date(),
                ),
            );

            return output.response;
        } catch (error) {
            const fspiopException = FspiopErrorTranslator.toFspiopException(error);
            const errorObject = fspiopException.toErrorObject();

            try {
                await this.outboundPartiesAuditPublisher.publish(
                    new AuditOutboundPartiesCommand.Input(
                        id,
                        id,
                        SendMoneyController.RAIL,
                        payerFsp,
                        request.to.fspId,
                        request.to.idType,
                        request.to.idValue,
                        SendMoneyController.toOptionalValue(request.to.idSubValue),
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

    @Put(':transferId')
    async put(
        @Param('transferId') transferId: string,
        @Body() request: PutSendMoneyRequest,
    ): Promise<SendMoneyResponse> {
        const transferRequest = await this.getTransferRequest(transferId);

        if (request.acceptParty != null) {
            return this.putAcceptParty(transferId, request.acceptParty, transferRequest);
        }

        if (request.acceptQuote != null) {
            return this.putAcceptQuote(transferId, request.acceptQuote, transferRequest);
        }

        throw new FspiopException(
            FspiopErrors.MISSING_MANDATORY_ELEMENT,
            'acceptParty or acceptQuote is required.',
        );
    }

    private async getTransferRequest(transferId: string): Promise<TransferRequest> {
        const transferRequest = await this.redisClient.get<TransferRequest>(transferId);

        if (transferRequest == null) {
            throw new FspiopException(
                FspiopErrors.TRANSFER_ID_NOT_FOUND,
                `Transfer ${transferId} was not found.`,
            );
        }

        return transferRequest;
    }

    private async putAcceptParty(
        transferId: string,
        acceptParty: boolean,
        transferRequest: TransferRequest,
    ): Promise<SendMoneyResponse> {
        const createdAt = new Date();
        const id = SendMoneyController.nextAuditId();
        const quoteRequest = SendMoneyController.toQuotesPostRequest(transferId, transferRequest);
        const payerFsp = SendMoneyController.getFspId(transferRequest.payer, 'payer');
        const payeeFsp = SendMoneyController.getFspId(transferRequest.payee, 'payee');

        try {
            const output: PutAcceptPartyCommand.Output = await this.commandBus.execute(
                new PutAcceptPartyCommand(
                    new PutAcceptPartyCommand.Input(transferId, acceptParty),
                ),
            );

            await this.outboundQuotesAuditPublisher.publish(
                new AuditOutboundQuotesCommand.Input(
                    id,
                    transferId,
                    SendMoneyController.RAIL,
                    payerFsp,
                    payeeFsp,
                    quoteRequest.quoteId,
                    quoteRequest,
                    output.callback,
                    null,
                    createdAt,
                    new Date(),
                ),
            );

            return output.response;
        } catch (error) {
            const fspiopException = FspiopErrorTranslator.toFspiopException(error, transferId);
            const errorObject = fspiopException.toErrorObject();

            try {
                await this.outboundQuotesAuditPublisher.publish(
                    new AuditOutboundQuotesCommand.Input(
                        id,
                        transferId,
                        SendMoneyController.RAIL,
                        payerFsp,
                        payeeFsp,
                        quoteRequest.quoteId,
                        quoteRequest,
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

    private async putAcceptQuote(
        transferId: string,
        acceptQuote: boolean,
        transferRequest: TransferRequest,
    ): Promise<SendMoneyResponse> {
        const createdAt = new Date();
        const id = SendMoneyController.nextAuditId();
        const transfersPostRequest = SendMoneyController.toTransfersPostRequest(transferId, transferRequest);
        const payerFsp = SendMoneyController.getFspId(transferRequest.payer, 'payer');
        const payeeFsp = SendMoneyController.getFspId(transferRequest.payee, 'payee');

        try {
            const output: PutAcceptQuoteCommand.Output = await this.commandBus.execute(
                new PutAcceptQuoteCommand(
                    new PutAcceptQuoteCommand.Input(transferId, acceptQuote),
                ),
            );

            await this.outboundTransfersAuditPublisher.publish(
                new AuditOutboundTransfersCommand.Input(
                    id,
                    transferId,
                    SendMoneyController.RAIL,
                    payerFsp,
                    payeeFsp,
                    transfersPostRequest.transferId,
                    transfersPostRequest,
                    output.callback,
                    null,
                    createdAt,
                    new Date(),
                ),
            );

            return output.response;
        } catch (error) {
            const fspiopException = FspiopErrorTranslator.toFspiopException(error, transferId);
            const errorObject = fspiopException.toErrorObject();

            try {
                await this.outboundTransfersAuditPublisher.publish(
                    new AuditOutboundTransfersCommand.Input(
                        id,
                        transferId,
                        SendMoneyController.RAIL,
                        payerFsp,
                        payeeFsp,
                        transfersPostRequest.transferId,
                        transfersPostRequest,
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
}

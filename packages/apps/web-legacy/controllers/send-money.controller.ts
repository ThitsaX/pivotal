import {Body, Controller, Headers, Inject, Param, Post, Put} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {
    AuditOutboundPartiesCommand,
    AuditOutboundQuotesCommand,
    AuditOutboundTransfersCommand,
} from '@core/audit/domain';
import {
    OutboundPartiesAuditPublisher,
    OutboundQuotesAuditPublisher,
    OutboundTransfersAuditPublisher,
} from '@core/audit/producer';
import {
    CachedTransaction,
    PostSendMoneyCommand,
    PutAcceptPartyCommand,
    PutAcceptQuoteCommand,
    RedisClient,
    SendMoneyRequest,
    SendMoneyResponse,
} from '@core/legacy/domain';
import {
    FspiopErrorTranslator,
    FspiopErrors,
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
        const cachedTransaction = await this.getCachedTransaction(transferId);

        if (request.acceptParty != null) {
            return this.putAcceptParty(transferId, request.acceptParty, cachedTransaction);
        }

        if (request.acceptQuote != null) {
            return this.putAcceptQuote(transferId, request.acceptQuote, cachedTransaction);
        }

        throw new FspiopException(
            FspiopErrors.MISSING_MANDATORY_ELEMENT,
            'acceptParty or acceptQuote is required.',
        );
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

    private static toMoney(cachedTransaction: CachedTransaction): Money {
        const money = new Money();
        money.currency = cachedTransaction.currency;
        money.amount = cachedTransaction.amount;

        return money;
    }

    private static toTransactionType(cachedTransaction: CachedTransaction): TransactionType {
        const transactionType = new TransactionType();
        transactionType.scenario = cachedTransaction.transactionType;
        transactionType.subScenario = SendMoneyController.toOptionalValue(cachedTransaction.subScenario);
        transactionType.initiator = TransactionInitiator.Payer;
        transactionType.initiatorType = cachedTransaction.from.type ?? TransactionInitiatorType.Consumer;

        return transactionType;
    }

    private static toQuotesPostRequest(
        transferId: string,
        cachedTransaction: CachedTransaction,
    ): QuotesPostRequest {
        const quoteRequest = new QuotesPostRequest();
        quoteRequest.quoteId = transferId;
        quoteRequest.transactionId = transferId;
        quoteRequest.transactionRequestId = transferId;
        quoteRequest.payee = cachedTransaction.payee;
        quoteRequest.payer = cachedTransaction.payer;
        quoteRequest.amountType = cachedTransaction.amountType;
        quoteRequest.amount = SendMoneyController.toMoney(cachedTransaction);
        quoteRequest.transactionType = SendMoneyController.toTransactionType(cachedTransaction);
        quoteRequest.note = cachedTransaction.note;

        return quoteRequest;
    }

    private static toTransfersPostRequest(
        transferId: string,
        cachedTransaction: CachedTransaction,
    ): TransfersPostRequest {
        const quotes = cachedTransaction.quotes;

        if (quotes == null) {
            throw new FspiopException(
                FspiopErrors.QUOTE_ID_NOT_FOUND,
                `Quote was not found for transfer ${transferId}.`,
            );
        }

        const transferRequest = new TransfersPostRequest();
        transferRequest.transferId = transferId;
        transferRequest.payerFsp = SendMoneyController.getFspId(cachedTransaction.payer, 'payer');
        transferRequest.payeeFsp = SendMoneyController.getFspId(cachedTransaction.payee, 'payee');
        transferRequest.amount = quotes.transferAmount;
        transferRequest.ilpPacket = quotes.ilpPacket;
        transferRequest.condition = quotes.condition;
        transferRequest.expiration = quotes.expiration;
        transferRequest.extensionList = quotes.extensionList;

        return transferRequest;
    }

    private async getCachedTransaction(transferId: string): Promise<CachedTransaction> {
        const cachedTransaction = await this.redisClient.get<CachedTransaction>(transferId);

        if (cachedTransaction == null) {
            throw new FspiopException(
                FspiopErrors.TRANSFER_ID_NOT_FOUND,
                `Transfer ${transferId} was not found in cache.`,
            );
        }

        return cachedTransaction;
    }

    private async putAcceptParty(
        transferId: string,
        acceptParty: boolean,
        cachedTransaction: CachedTransaction,
    ): Promise<SendMoneyResponse> {
        const createdAt = new Date();
        const id = SendMoneyController.nextAuditId();
        const quoteRequest = SendMoneyController.toQuotesPostRequest(transferId, cachedTransaction);
        const payerFsp = SendMoneyController.getFspId(cachedTransaction.payer, 'payer');
        const payeeFsp = SendMoneyController.getFspId(cachedTransaction.payee, 'payee');

        try {
            const output: PutAcceptPartyCommand.Output = await this.commandBus.execute(
                new PutAcceptPartyCommand(
                    new PutAcceptPartyCommand.Input(transferId, acceptParty),
                ),
            );

            await this.outboundQuotesAuditPublisher.publish(
                new AuditOutboundQuotesCommand.Input(
                    id,
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
        cachedTransaction: CachedTransaction,
    ): Promise<SendMoneyResponse> {
        const createdAt = new Date();
        const id = SendMoneyController.nextAuditId();
        const transferRequest = SendMoneyController.toTransfersPostRequest(transferId, cachedTransaction);
        const payerFsp = SendMoneyController.getFspId(cachedTransaction.payer, 'payer');
        const payeeFsp = SendMoneyController.getFspId(cachedTransaction.payee, 'payee');

        try {
            const output: PutAcceptQuoteCommand.Output = await this.commandBus.execute(
                new PutAcceptQuoteCommand(
                    new PutAcceptQuoteCommand.Input(transferId, acceptQuote),
                ),
            );

            await this.outboundTransfersAuditPublisher.publish(
                new AuditOutboundTransfersCommand.Input(
                    id,
                    SendMoneyController.RAIL,
                    payerFsp,
                    payeeFsp,
                    transferRequest.transferId,
                    transferRequest,
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
                        SendMoneyController.RAIL,
                        payerFsp,
                        payeeFsp,
                        transferRequest.transferId,
                        transferRequest,
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

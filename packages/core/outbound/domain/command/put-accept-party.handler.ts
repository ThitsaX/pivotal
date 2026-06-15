import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransactionMessage } from '@core/audit/common';
import { AuditTransactionPublisher } from '@core/audit/producer';
import {
    Currency,
    ExtensionList,
    FspiopAxios,
    FspiopAxiosError,
    FspiopCurrencies,
    FspiopErrors,
    FspiopErrorTranslator,
    FspiopException,
    FspiopHeaders,
    FspiopMoney,
    FspiopPubSubSubjects,
    FspiopResponseSubscriber,
    Money,
    Party,
    QuotesIDPutResponse,
    QuotesPostRequest,
    TransactionInitiator,
    TransactionInitiatorType,
    TransactionType,
} from '@shared/fspiop';
import { TransferRequest } from '../cache';
import { AmountDecimalValidator, RedisClient } from '../component';
import { SendMoneyResponse } from '../dto';
import { PutAcceptPartyCommand } from './put-accept-party.command';
import { SendMoneyResponseMapper } from './send-money-response.mapper';

@CommandHandler(PutAcceptPartyCommand)
export class PutAcceptPartyHandler
    implements ICommandHandler<PutAcceptPartyCommand, PutAcceptPartyCommand.Output> {
    private static readonly SCHEME_FEE_AMOUNT_KEY = 'scheme_fee_amount';
    private static readonly FEE_CURRENCY_KEY = 'scheme_fee_currency';

    private readonly logger = new Logger(PutAcceptPartyHandler.name);

    constructor(
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(FspiopResponseSubscriber)
        private readonly subscriber: FspiopResponseSubscriber,
        @Inject(RedisClient)
        private readonly redisClient: RedisClient,
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
        @Inject(AmountDecimalValidator)
        private readonly amountDecimalValidator: AmountDecimalValidator,
    ) {
    }

    async execute(command: PutAcceptPartyCommand): Promise<PutAcceptPartyCommand.Output> {
        const { transferId, acceptParty, amount, extensionList, requestSource } = command.input;
        const transferRequest = await this.getTransferRequest(transferId);
        const source = PutAcceptPartyHandler.getFspId(transferRequest.payer, 'payer');
        PutAcceptPartyHandler.assertSourceCanActForPayer(requestSource, source);
        // Payer's confirmed amount is authoritative; intentionally overrides the POST amount.
        transferRequest.amount = FspiopMoney.normalizeAmount(amount);
        this.amountDecimalValidator.validate(transferRequest.amount);
        const destination = PutAcceptPartyHandler.getFspId(transferRequest.payee, 'payee');
        const quoteRequest = PutAcceptPartyHandler.toQuotesPostRequest(transferId, transferRequest, extensionList);
        const { quoteId } = quoteRequest;
        const { quotesUrl } = this.fspiopAxios.settings;
        const createdAt = new Date();

        await this.auditPublisher.publish(
            TransactionMessage.request(
                TransactionMessage.InvocationPhase.Quotes,
                TransactionMessage.InvocationGateway.Outbound,
                {
                    correlationId: transferId,
                    payerFsp: source,
                    payeeFsp: destination,
                    request: quoteRequest,
                    occurredAt: createdAt,
                },
            ),
        );

        try {
            if (!acceptParty) {
                throw new FspiopException(
                    FspiopErrors.PAYER_REJECTED_TRANSACTION_REQUEST,
                    'Payer rejected party confirmation.',
                );
            }

            const headers = FspiopHeaders.Values.Quotes.forRequest(quoteId, source, destination);
            const successSubject = FspiopPubSubSubjects.Quotes.forSuccess(source, quoteId);
            const errorSubject = FspiopPubSubSubjects.Quotes.forError(source, quoteId);

            const waitPromise = this.subscriber.waitFor<QuotesIDPutResponse>(
                successSubject,
                errorSubject,
            );

            try {
                await this.fspiopAxios.postQuotes(quotesUrl, headers, quoteRequest);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const stack = error instanceof Error ? error.stack : undefined;

                this.logger.error(`postQuotes failed for transferId=${transferId}`, stack ?? message);
                this.subscriber.cancel(successSubject);
                throw PutAcceptPartyHandler.toFspiopException(error, transferId);
            }

            const callback = await waitPromise;
            transferRequest.quotes = callback;
            transferRequest.transfer = undefined;

            const response = PutAcceptPartyHandler.toResponse(transferRequest, callback);

            await this.redisClient.set(transferId, transferRequest);
            await this.auditPublisher.publish(
                TransactionMessage.response(
                    TransactionMessage.InvocationPhase.Quotes,
                    TransactionMessage.InvocationGateway.Outbound,
                    {
                        correlationId: transferId,
                        payerFsp: source,
                        payeeFsp: destination,
                        request: quoteRequest,
                        response: callback,
                        occurredAt: new Date(),
                    },
                ),
            );

            return new PutAcceptPartyCommand.Output(response, callback);
        } catch (error) {
            this.logger.error(`Put SendMoney acceptParty Error Response for transferId=${transferId} : ${JSON.stringify(error)}`);
            const fspiopException = PutAcceptPartyHandler.toFspiopException(error, transferId);

            try {
                await this.auditPublisher.publish(
                    TransactionMessage.error(
                        TransactionMessage.InvocationPhase.Quotes,
                        TransactionMessage.InvocationGateway.Outbound,
                        {
                            correlationId: transferId,
                            payerFsp: source,
                            payeeFsp: destination,
                            request: quoteRequest,
                            error: fspiopException.toErrorObject(),
                            occurredAt: new Date(),
                        },
                    ),
                );
            } finally {
                try {
                    await this.redisClient.delete(transferId);
                } finally {
                    throw fspiopException;
                }
            }
        }
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

    private static assertSourceCanActForPayer(requestSource: string | undefined, payerFsp: string): void {
        const normalizedSource = requestSource?.trim();

        if (normalizedSource == null || normalizedSource.length === 0 || normalizedSource === payerFsp) {
            return;
        }

        throw new FspiopException(
            FspiopErrors.PAYER_PERMISSION_ERROR,
            `fspiop-source '${normalizedSource}' is not authorized to act for payer FSP '${payerFsp}'.`,
        );
    }

    private static getFspId(party: Party | undefined, label: string): string {
        const fspId = party?.partyIdInfo?.fspId?.trim();

        if (fspId == null || fspId.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                `${label}.partyIdInfo.fspId is required to resolve quote routing.`,
            );
        }

        return fspId;
    }

    private static toQuotesPostRequest(
        transferId: string,
        transferRequest: TransferRequest,
        extensionList: ExtensionList | undefined,
    ): QuotesPostRequest {
        const quoteRequest = new QuotesPostRequest();
        quoteRequest.quoteId = transferId;
        quoteRequest.transactionId = transferId;
        quoteRequest.transactionRequestId = transferId;
        quoteRequest.payee = transferRequest.payee;
        quoteRequest.payer = transferRequest.payer;
        quoteRequest.amountType = transferRequest.amountType;
        quoteRequest.amount = PutAcceptPartyHandler.toMoney(transferRequest.currency, transferRequest.amount);
        quoteRequest.transactionType = PutAcceptPartyHandler.toTransactionType(transferRequest);
        quoteRequest.note = transferRequest.note;
        quoteRequest.extensionList = extensionList;

        return quoteRequest;
    }

    private static toMoney(currency: Currency, amount: string): Money {
        const money = new Money();
        money.currency = currency;
        money.amount = amount;

        return money;
    }

    private static toTransactionType(transferRequest: TransferRequest): TransactionType {
        const transactionType = new TransactionType();
        transactionType.scenario = transferRequest.transactionType;
        transactionType.subScenario = PutAcceptPartyHandler.toOptionalValue(transferRequest.subScenario);
        transactionType.initiator = TransactionInitiator.Payer;
        transactionType.initiatorType = transferRequest.from.type ?? TransactionInitiatorType.Consumer;

        return transactionType;
    }

    private static toResponse(
        transferRequest: TransferRequest,
        callback: QuotesIDPutResponse,
    ): SendMoneyResponse {
        const payeeFspFeeAmount = PutAcceptPartyHandler.toPayeeFspFeeAmount(callback, transferRequest.currency);

        return SendMoneyResponseMapper.toWaitingForQuoteAcceptance(
            transferRequest,
            payeeFspFeeAmount,
            callback.extensionList,
        );
    }

    private static toPayeeFspFeeAmount(callback: QuotesIDPutResponse, fallbackCurrency: Currency): string {
        const payeeFspFeeAmount = callback.payeeFspFee?.amount?.trim();

        if (payeeFspFeeAmount != null && payeeFspFeeAmount.length > 0) {
            return payeeFspFeeAmount;
        }

        return PutAcceptPartyHandler.toSchemeFee(callback, fallbackCurrency).amount;
    }

    private static toSchemeFee(callback: QuotesIDPutResponse, fallbackCurrency: Currency): Money {
        const transferAmountCurrency = callback.transferAmount?.currency ?? fallbackCurrency;
        const transferAmountScale = FspiopCurrencies.get(transferAmountCurrency)?.scale;

        if (transferAmountScale == null) {
            throw new FspiopException(
                FspiopErrors.PAYEE_UNSUPPORTED_CURRENCY,
                `Unsupported currency ${transferAmountCurrency}`,
            );
        }

        const extensionList = PutAcceptPartyHandler.toExtensionList(callback.extensionList);
        const schemeFeeAmount = PutAcceptPartyHandler.findExtensionValue(
            extensionList,
            PutAcceptPartyHandler.SCHEME_FEE_AMOUNT_KEY,
        ) ?? '0';
        const feeCurrencyValue = PutAcceptPartyHandler.findExtensionValue(
            extensionList,
            PutAcceptPartyHandler.FEE_CURRENCY_KEY,
        );
        const feeCurrency = feeCurrencyValue as Currency | undefined;
        const feeCurrencyScale = feeCurrency == null
            ? undefined
            : FspiopCurrencies.get(feeCurrency)?.scale;
        const currency = feeCurrencyScale == null || feeCurrency == null
            ? transferAmountCurrency
            : feeCurrency;
        const scale = feeCurrencyScale == null
            ? transferAmountScale
            : feeCurrencyScale;
        const serializedSchemeFeeAmount = FspiopMoney.serialize(schemeFeeAmount, scale);

        return PutAcceptPartyHandler.toMoney(
            currency,
            FspiopMoney.deserialize(serializedSchemeFeeAmount, scale),
        );
    }

    private static toExtensionList(extensionList: ExtensionList | undefined): ExtensionList {
        const normalizedExtensionList = new ExtensionList();
        normalizedExtensionList.extension = extensionList?.extension ?? [];

        return normalizedExtensionList;
    }

    private static findExtensionValue(extensionList: ExtensionList, targetKey: string): string | undefined {
        const normalizedTargetKey = targetKey.trim().toLowerCase();

        for (const extension of extensionList.extension) {
            const key = extension.key?.trim().toLowerCase() ?? '';

            if (key !== normalizedTargetKey) {
                continue;
            }

            return extension.value?.trim();
        }

        return undefined;
    }

    private static toOptionalValue(value: string | undefined): string | undefined {
        const normalizedValue = value?.trim();

        return normalizedValue == null || normalizedValue.length === 0
            ? undefined
            : normalizedValue;
    }

    private static toFspiopException(error: unknown, transferId: string): FspiopException {
        if (FspiopAxiosError.is(error)) {
            const info = error.errorInformationResponse?.errorInformation;
            const code = info?.errorCode ?? '';
            const desc = info?.errorDescription?.trim().length
                ? info.errorDescription
                : 'Communication error';
            const extensionList = info?.extensionList;
            const errorDef = FspiopErrors.find(code) ?? FspiopErrors.COMMUNICATION_ERROR;

            return new FspiopException(errorDef, desc, extensionList);
        }

        return FspiopErrorTranslator.toFspiopException(error);
    }
}

import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {
    Currency,
    FspiopAxios,
    FspiopAxiosError,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
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
import {CachedTransaction} from '../cache';
import {RedisClient} from '../component';
import {SendMoneyResponse} from '../dto';
import {PutAcceptPartyCommand} from './put-accept-party.command';

@CommandHandler(PutAcceptPartyCommand)
export class PutAcceptPartyHandler
    implements ICommandHandler<PutAcceptPartyCommand, PutAcceptPartyCommand.Output> {

    constructor(
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(FspiopResponseSubscriber)
        private readonly subscriber: FspiopResponseSubscriber,
        @Inject(RedisClient)
        private readonly redisClient: RedisClient,
    ) {
    }

    async execute(command: PutAcceptPartyCommand): Promise<PutAcceptPartyCommand.Output> {
        const {transferId, acceptParty} = command.input;
        const cachedTransaction = await this.getCachedTransaction(transferId);

        if (!acceptParty) {
            throw new FspiopException(
                FspiopErrors.PAYER_REJECTED_TRANSACTION_REQUEST,
                'Payer rejected party confirmation.',
            );
        }

        const source = PutAcceptPartyHandler.getFspId(cachedTransaction.payer, 'payer');
        const destination = PutAcceptPartyHandler.getFspId(cachedTransaction.payee, 'payee');
        const quoteRequest = PutAcceptPartyHandler.toQuotesPostRequest(transferId, cachedTransaction);
        const {quoteId} = quoteRequest;
        const {quotesUrl} = this.fspiopAxios.settings;

        const headers = FspiopHeaders.Values.Quotes.forRequest(source, destination);
        const successSubject = FspiopPubSubSubjects.Quotes.forSuccess(source, quoteId);
        const errorSubject = FspiopPubSubSubjects.Quotes.forError(source, quoteId);

        const waitPromise = this.subscriber.waitFor<QuotesIDPutResponse>(
            successSubject,
            errorSubject,
        );

        try {
            await this.fspiopAxios.postQuotes(quotesUrl, headers, quoteRequest);
        } catch (error) {
            this.subscriber.cancel(successSubject);

            if (FspiopAxiosError.is(error)) {
                const info = error.errorInformationResponse?.errorInformation;
                const code = info?.errorCode ?? '';
                const desc = info?.errorDescription?.trim().length
                    ? info.errorDescription
                    : 'Communication error';
                const extensionList = info?.extensionList;
                const errorDef = FspiopErrors.find(code) ?? FspiopErrors.COMMUNICATION_ERROR;

                throw new FspiopException(errorDef, desc, extensionList);
            }

            throw error;
        }

        const callback = await waitPromise;
        cachedTransaction.quotes = callback;
        cachedTransaction.transfer = undefined;

        const response = PutAcceptPartyHandler.toResponse(cachedTransaction, callback);

        await this.redisClient.set(transferId, cachedTransaction);

        return new PutAcceptPartyCommand.Output(response, callback);
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
        cachedTransaction: CachedTransaction,
    ): QuotesPostRequest {
        const quoteRequest = new QuotesPostRequest();
        quoteRequest.quoteId = transferId;
        quoteRequest.transactionId = transferId;
        quoteRequest.transactionRequestId = transferId;
        quoteRequest.payee = cachedTransaction.payee;
        quoteRequest.payer = cachedTransaction.payer;
        quoteRequest.amountType = cachedTransaction.amountType;
        quoteRequest.amount = PutAcceptPartyHandler.toMoney(cachedTransaction.currency, cachedTransaction.amount);
        quoteRequest.transactionType = PutAcceptPartyHandler.toTransactionType(cachedTransaction);
        quoteRequest.note = cachedTransaction.note;

        return quoteRequest;
    }

    private static toMoney(currency: Currency, amount: string): Money {
        const money = new Money();
        money.currency = currency;
        money.amount = amount;

        return money;
    }

    private static toTransactionType(cachedTransaction: CachedTransaction): TransactionType {
        const transactionType = new TransactionType();
        transactionType.scenario = cachedTransaction.transactionType;
        transactionType.subScenario = PutAcceptPartyHandler.toOptionalValue(cachedTransaction.subScenario);
        transactionType.initiator = TransactionInitiator.Payer;
        transactionType.initiatorType = cachedTransaction.from.type ?? TransactionInitiatorType.Consumer;

        return transactionType;
    }

    private static toResponse(
        cachedTransaction: CachedTransaction,
        callback: QuotesIDPutResponse,
    ): SendMoneyResponse {
        const response = new SendMoneyResponse();
        response.transferId = cachedTransaction.transferId;
        response.homeTransactionId = cachedTransaction.homeTransactionId;
        response.from = cachedTransaction.from;
        response.to = cachedTransaction.to;
        response.amountType = cachedTransaction.amountType;
        response.transactionType = cachedTransaction.transactionType;
        response.note = cachedTransaction.note;
        response.amount = callback.transferAmount?.amount ?? cachedTransaction.amount;
        response.payeeFspFeeAmount = callback.payeeFspFee?.amount;
        response.currency = callback.transferAmount?.currency ?? cachedTransaction.currency;
        response.initiatedTimestamp = cachedTransaction.initiatedTimestamp;
        response.direction = cachedTransaction.direction;
        response.supportedCurrencies = cachedTransaction.supportedCurrencies;
        response.extensionList = callback.extensionList?.extension;

        return response;
    }

    private static toOptionalValue(value: string | undefined): string | undefined {
        const normalizedValue = value?.trim();

        return normalizedValue == null || normalizedValue.length === 0
            ? undefined
            : normalizedValue;
    }
}

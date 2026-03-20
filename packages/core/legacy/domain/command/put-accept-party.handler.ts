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
import {TransferRequest} from '../cache';
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
        const transferRequest = await this.getTransferRequest(transferId);

        if (!acceptParty) {
            throw new FspiopException(
                FspiopErrors.PAYER_REJECTED_TRANSACTION_REQUEST,
                'Payer rejected party confirmation.',
            );
        }

        const source = PutAcceptPartyHandler.getFspId(transferRequest.payer, 'payer');
        const destination = PutAcceptPartyHandler.getFspId(transferRequest.payee, 'payee');
        const quoteRequest = PutAcceptPartyHandler.toQuotesPostRequest(transferId, transferRequest);
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
        transferRequest.quotes = callback;
        transferRequest.transfer = undefined;

        const response = PutAcceptPartyHandler.toResponse(transferRequest, callback);

        await this.redisClient.set(transferId, transferRequest);

        return new PutAcceptPartyCommand.Output(response, callback);
    }

    private async getTransferRequest(transferId: string): Promise<TransferRequest> {
        const transferRequest = await this.redisClient.get<TransferRequest>(transferId);

        if (transferRequest == null) {
            throw new FspiopException(
                FspiopErrors.TRANSFER_ID_NOT_FOUND,
                `Transfer ${transferId} was not found in cache.`,
            );
        }

        return transferRequest;
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
        const response = new SendMoneyResponse();
        response.transferId = transferRequest.transferId;
        response.homeTransactionId = transferRequest.homeTransactionId;
        response.from = transferRequest.from;
        response.to = transferRequest.to;
        response.amountType = transferRequest.amountType;
        response.transactionType = transferRequest.transactionType;
        response.note = transferRequest.note;
        response.amount = callback.transferAmount?.amount ?? transferRequest.amount;
        response.payeeFspFeeAmount = callback.payeeFspFee?.amount;
        response.currency = callback.transferAmount?.currency ?? transferRequest.currency;
        response.direction = 'OUTBOUND';
        response.supportedCurrencies = transferRequest.supportedCurrencies;
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

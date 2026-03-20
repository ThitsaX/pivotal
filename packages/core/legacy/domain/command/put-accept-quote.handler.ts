import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {
    FspiopAxios,
    FspiopAxiosError,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    FspiopPubSubSubjects,
    FspiopResponseSubscriber,
    Party,
    QuotesIDPutResponse,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '@shared/fspiop';
import {CachedTransaction} from '../cache';
import {RedisClient} from '../component';
import {SendMoneyResponse} from '../dto';
import {PutAcceptQuoteCommand} from './put-accept-quote.command';

@CommandHandler(PutAcceptQuoteCommand)
export class PutAcceptQuoteHandler
    implements ICommandHandler<PutAcceptQuoteCommand, PutAcceptQuoteCommand.Output> {

    constructor(
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(FspiopResponseSubscriber)
        private readonly subscriber: FspiopResponseSubscriber,
        @Inject(RedisClient)
        private readonly redisClient: RedisClient,
    ) {
    }

    async execute(command: PutAcceptQuoteCommand): Promise<PutAcceptQuoteCommand.Output> {
        const {transferId, acceptQuote} = command.input;
        const cachedTransaction = await this.getCachedTransaction(transferId);

        if (!acceptQuote) {
            throw new FspiopException(
                FspiopErrors.GENERIC_PAYER_REJECTION,
                'Payer rejected quote confirmation.',
            );
        }

        const source = PutAcceptQuoteHandler.getFspId(cachedTransaction.payer, 'payer');
        const destination = PutAcceptQuoteHandler.getFspId(cachedTransaction.payee, 'payee');
        const transferRequest = PutAcceptQuoteHandler.toTransfersPostRequest(transferId, cachedTransaction);
        const {transfersUrl} = this.fspiopAxios.settings;

        const headers = FspiopHeaders.Values.Transfers.forRequest(source, destination);
        const successSubject = FspiopPubSubSubjects.Transfers.forSuccess(source, transferId);
        const errorSubject = FspiopPubSubSubjects.Transfers.forError(source, transferId);

        const waitPromise = this.subscriber.waitFor<TransfersIDPutResponse>(
            successSubject,
            errorSubject,
        );

        try {
            await this.fspiopAxios.postTransfers(transfersUrl, headers, transferRequest);
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
        cachedTransaction.transfer = callback;
        const response = PutAcceptQuoteHandler.toResponse(cachedTransaction, callback);

        await this.redisClient.set(transferId, cachedTransaction);

        return new PutAcceptQuoteCommand.Output(response, callback);
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
                `${label}.partyIdInfo.fspId is required to resolve transfer routing.`,
            );
        }

        return fspId;
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

        const payerFsp = PutAcceptQuoteHandler.getFspId(cachedTransaction.payer, 'payer');
        const payeeFsp = PutAcceptQuoteHandler.getFspId(cachedTransaction.payee, 'payee');
        const transferRequest = new TransfersPostRequest();
        transferRequest.transferId = transferId;
        transferRequest.payerFsp = payerFsp;
        transferRequest.payeeFsp = payeeFsp;
        transferRequest.amount = quotes.transferAmount;
        transferRequest.ilpPacket = quotes.ilpPacket;
        transferRequest.condition = quotes.condition;
        transferRequest.expiration = quotes.expiration;
        transferRequest.extensionList = PutAcceptQuoteHandler.toExtensionList(quotes);

        return transferRequest;
    }

    private static toExtensionList(quotes: QuotesIDPutResponse): QuotesIDPutResponse['extensionList'] {
        return quotes.extensionList;
    }

    private static toResponse(
        cachedTransaction: CachedTransaction,
        callback: TransfersIDPutResponse,
    ): SendMoneyResponse {
        const response = new SendMoneyResponse();
        response.transferId = cachedTransaction.transferId;
        response.homeTransactionId = cachedTransaction.homeTransactionId;
        response.from = cachedTransaction.from;
        response.to = cachedTransaction.to;
        response.amountType = cachedTransaction.amountType;
        response.transactionType = cachedTransaction.transactionType;
        response.note = cachedTransaction.note;
        response.amount = cachedTransaction.amount;
        response.payeeFspFeeAmount = cachedTransaction.quotes?.payeeFspFee?.amount;
        response.currency = cachedTransaction.quotes?.transferAmount?.currency ?? cachedTransaction.currency;
        response.initiatedTimestamp = callback.completedTimestamp ?? cachedTransaction.initiatedTimestamp;
        response.direction = cachedTransaction.direction;
        response.supportedCurrencies = cachedTransaction.supportedCurrencies;
        response.extensionList = callback.extensionList?.extension;

        return response;
    }
}

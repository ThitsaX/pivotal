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
import {TransferRequest} from '../cache';
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
        const transferRequest = await this.getTransferRequest(transferId);

        if (!acceptQuote) {
            throw new FspiopException(
                FspiopErrors.GENERIC_PAYER_REJECTION,
                'Payer rejected quote confirmation.',
            );
        }

        const source = PutAcceptQuoteHandler.getFspId(transferRequest.payer, 'payer');
        const destination = PutAcceptQuoteHandler.getFspId(transferRequest.payee, 'payee');
        const transfersPostRequest = PutAcceptQuoteHandler.toTransfersPostRequest(transferId, transferRequest);
        const {transfersUrl} = this.fspiopAxios.settings;

        const headers = FspiopHeaders.Values.Transfers.forRequest(source, destination);
        const successSubject = FspiopPubSubSubjects.Transfers.forSuccess(source, transferId);
        const errorSubject = FspiopPubSubSubjects.Transfers.forError(source, transferId);

        const waitPromise = this.subscriber.waitFor<TransfersIDPutResponse>(
            successSubject,
            errorSubject,
        );

        try {
            await this.fspiopAxios.postTransfers(transfersUrl, headers, transfersPostRequest);
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
        transferRequest.transfer = callback;
        const response = PutAcceptQuoteHandler.toResponse(transferRequest, callback);

        await this.redisClient.set(transferId, transferRequest);

        return new PutAcceptQuoteCommand.Output(response, callback);
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
                `${label}.partyIdInfo.fspId is required to resolve transfer routing.`,
            );
        }

        return fspId;
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

        const payerFsp = PutAcceptQuoteHandler.getFspId(transferRequest.payer, 'payer');
        const payeeFsp = PutAcceptQuoteHandler.getFspId(transferRequest.payee, 'payee');
        const transfersPostRequest = new TransfersPostRequest();
        transfersPostRequest.transferId = transferId;
        transfersPostRequest.payerFsp = payerFsp;
        transfersPostRequest.payeeFsp = payeeFsp;
        transfersPostRequest.amount = quotes.transferAmount;
        transfersPostRequest.ilpPacket = quotes.ilpPacket;
        transfersPostRequest.condition = quotes.condition;
        transfersPostRequest.expiration = quotes.expiration;
        transfersPostRequest.extensionList = PutAcceptQuoteHandler.toExtensionList(quotes);

        return transfersPostRequest;
    }

    private static toExtensionList(quotes: QuotesIDPutResponse): QuotesIDPutResponse['extensionList'] {
        return quotes.extensionList;
    }

    private static toResponse(
        transferRequest: TransferRequest,
        callback: TransfersIDPutResponse,
    ): SendMoneyResponse {
        const response = new SendMoneyResponse();
        response.transferId = transferRequest.transferId;
        response.homeTransactionId = transferRequest.homeTransactionId;
        response.from = transferRequest.from;
        response.to = transferRequest.to;
        response.amountType = transferRequest.amountType;
        response.transactionType = transferRequest.transactionType;
        response.note = transferRequest.note;
        response.amount = transferRequest.amount;
        response.payeeFspFeeAmount = transferRequest.quotes?.payeeFspFee?.amount;
        response.currency = transferRequest.quotes?.transferAmount?.currency ?? transferRequest.currency;
        response.direction = 'OUTBOUND';
        response.supportedCurrencies = transferRequest.supportedCurrencies;
        response.extensionList = callback.extensionList?.extension;

        return response;
    }
}

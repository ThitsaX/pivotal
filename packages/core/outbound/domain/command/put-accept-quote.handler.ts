// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransactionMessage } from '@core/audit/common';
import { AuditTransactionPublisher } from '@core/audit/producer';
import {
    FspiopAxios,
    FspiopAxiosError,
    FspiopErrors,
    FspiopErrorTranslator,
    FspiopException,
    FspiopHeaders,
    FspiopPubSubSubjects,
    FspiopResponseSubscriber,
    Party,
    QuotesIDPutResponse,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '@shared/fspiop';
import { TransferRequest } from '../cache';
import { AmountDecimalValidator, RedisClient } from '../component';
import { SendMoneyResponse } from '../dto';
import { PutAcceptQuoteCommand } from './put-accept-quote.command';
import { SendMoneyResponseMapper } from './send-money-response.mapper';

@CommandHandler(PutAcceptQuoteCommand)
export class PutAcceptQuoteHandler
    implements ICommandHandler<PutAcceptQuoteCommand, PutAcceptQuoteCommand.Output> {

    // The lock must outlive the longest in-flight wait (the FSPIOP response
    // timeout) so a gateway/client retry landing on another replica is rejected
    // for the whole window the winning replica is still talking to the Hub.
    // Released in finally; the TTL is only the crash backstop.
    private static readonly IN_FLIGHT_LOCK_TTL_MS = FspiopResponseSubscriber.DEFAULT_TIMEOUT_MS + 10_000;

    private readonly logger = new Logger(PutAcceptQuoteHandler.name);

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
        return SendMoneyResponseMapper.toFinalState(
            transferRequest,
            callback.transferState,
            callback.extensionList,
        );
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

    async execute(command: PutAcceptQuoteCommand): Promise<PutAcceptQuoteCommand.Output> {
        const { transferId } = command.input;
        const lockToken = await this.redisClient.acquireLock(
            transferId,
            PutAcceptQuoteHandler.IN_FLIGHT_LOCK_TTL_MS,
        );

        // Another replica is already driving this transferId (typically a gateway
        // retry after a per-try timeout). Fail fast WITHOUT re-dispatching the
        // transfer to the Hub — duplicate POST /transfers on the same transferId is
        // the dangerous, money-moving leg. GENERIC_CLIENT_ERROR maps to a 4xx, so
        // the gateway does not retry again.
        if (lockToken == null) {
            throw new FspiopException(
                FspiopErrors.GENERIC_CLIENT_ERROR,
                `Transfer ${transferId} is already being processed; ignoring duplicate request.`,
            );
        }

        try {
            return await this.executeLocked(command);
        } finally {
            await this.redisClient.releaseLock(transferId, lockToken);
        }
    }

    private async executeLocked(command: PutAcceptQuoteCommand): Promise<PutAcceptQuoteCommand.Output> {
        const { transferId, acceptQuote, requestSource } = command.input;
        const transferRequest = await this.getTransferRequest(transferId);

        // Idempotency guard (sequential duplicates): a successful acceptQuote deletes the
        // cache, so a repeat usually surfaces as TRANSFER_ID_NOT_FOUND. This is the
        // belt-and-suspenders case — if `transfer` is already set the transfer phase has
        // run, so reject before re-POSTing /transfers (a duplicate prepare on the same
        // transferId) or writing another audit record.
        if (transferRequest.transfer != null) {
            this.logger.warn(`Duplicate acceptQuote for transferId=${transferId} ignored; transfer already completed.`);
            throw new FspiopException(
                FspiopErrors.GENERIC_CLIENT_ERROR,
                `Transfer ${transferId} already completed; duplicate acceptQuote ignored.`,
            );
        }

        const source = PutAcceptQuoteHandler.getFspId(transferRequest.payer, 'payer');
        PutAcceptQuoteHandler.assertSourceCanActForPayer(requestSource, source);
        const destination = PutAcceptQuoteHandler.getFspId(transferRequest.payee, 'payee');
        const transfersPostRequest = PutAcceptQuoteHandler.toTransfersPostRequest(transferId, transferRequest);
        const { transfersUrl } = this.fspiopAxios.settings;
        const createdAt = new Date();
        this.amountDecimalValidator.validate(transfersPostRequest.amount);

        await this.auditPublisher.publish(
            TransactionMessage.request(
                TransactionMessage.InvocationPhase.Transfers,
                TransactionMessage.InvocationGateway.Outbound,
                {
                    correlationId: transferId,
                    payerFsp: source,
                    payeeFsp: destination,
                    request: transfersPostRequest,
                    occurredAt: createdAt,
                },
            ),
        );

        try {
            if (!acceptQuote) {
                throw new FspiopException(
                    FspiopErrors.GENERIC_PAYER_REJECTION,
                    'Payer rejected quote confirmation.',
                );
            }

            const headers = FspiopHeaders.Values.Transfers.forRequest(transferId, source, destination);
            const successSubject = FspiopPubSubSubjects.Transfers.forSuccess(source, transferId);
            const errorSubject = FspiopPubSubSubjects.Transfers.forError(source, transferId);

            const waitPromise = this.subscriber.waitFor<TransfersIDPutResponse>(
                successSubject,
                errorSubject,
            );

            try {
                await this.fspiopAxios.postTransfers(transfersUrl, headers, transfersPostRequest);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const stack = error instanceof Error ? error.stack : undefined;

                this.logger.error(`postTransfers failed for transferId=${transferId}`, stack ?? message);
                this.subscriber.cancel(successSubject);
                throw PutAcceptQuoteHandler.toFspiopException(error, transferId);
            }

            const callback = await waitPromise;
            transferRequest.transfer = callback;
            const response = PutAcceptQuoteHandler.toResponse(transferRequest, callback);

            await this.auditPublisher.publish(
                TransactionMessage.response(
                    TransactionMessage.InvocationPhase.Transfers,
                    TransactionMessage.InvocationGateway.Outbound,
                    {
                        correlationId: transferId,
                        payerFsp: source,
                        payeeFsp: destination,
                        request: transfersPostRequest,
                        response: callback,
                        occurredAt: new Date(),
                    },
                ),
            );
            await this.redisClient.delete(transferId);

            return new PutAcceptQuoteCommand.Output(response, callback);
        } catch (error) {
            this.logger.error(`Put SendMoney acceptQuote Error Response for transferId=${transferId} : ${JSON.stringify(error)}`);
            const fspiopException = PutAcceptQuoteHandler.toFspiopException(error, transferId);

            try {
                await this.auditPublisher.publish(
                    TransactionMessage.error(
                        TransactionMessage.InvocationPhase.Transfers,
                        TransactionMessage.InvocationGateway.Outbound,
                        {
                            correlationId: transferId,
                            payerFsp: source,
                            payeeFsp: destination,
                            request: transfersPostRequest,
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
}

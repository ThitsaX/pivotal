// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject, Logger} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {
    FspiopAxios,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
} from '@shared/fspiop';
import {PerformPostQuotesCommand} from './perform-post-quotes.command';
import {AuditErrorConverter, ConnectorSettings, FspConnector} from '../component';

@CommandHandler(PerformPostQuotesCommand)
export class PerformPostQuotesHandler
    implements ICommandHandler<PerformPostQuotesCommand, PerformPostQuotesCommand.Output> {
    private readonly logger = new Logger(PerformPostQuotesHandler.name);

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
        @Inject(ConnectorSettings)
        private readonly connectorSettings: ConnectorSettings,
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
    ) {
    }

    async execute(command: PerformPostQuotesCommand): Promise<PerformPostQuotesCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, request} = command.input;
        const {quotesUrl} = this.fspiopAxios.settings;
        const connectorId = this.connectorSettings.connectorId;
        const createdAt = new Date();
        const auditCorrelationId = PerformPostQuotesHandler.resolveCorrelationId(
            correlationId,
            request.transactionId,
            request.transactionRequestId,
            request.quoteId,
        );
        const headers = FspiopHeaders.Values.Quotes.forResult(
            correlationId?.trim() || auditCorrelationId,
            payerFsp,
            connectorId,
        );

        await this.auditPublisher.publish(
            TransactionMessage.request(
                TransactionMessage.InvocationPhase.Quotes,
                TransactionMessage.InvocationGateway.Connector,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    request,
                    occurredAt: createdAt,
                },
            ),
        );

        try {
            const response = await this.fspConnector.postQuotes(request);

            await this.fspiopAxios.putQuotes(
                quotesUrl,
                headers,
                request.quoteId,
                response,
            );

            await this.auditPublisher.publish(
                TransactionMessage.response(
                    TransactionMessage.InvocationPhase.Quotes,
                    TransactionMessage.InvocationGateway.Connector,
                    {
                        correlationId: auditCorrelationId,
                        payerFsp,
                        payeeFsp,
                        request,
                        response,
                        occurredAt: new Date(),
                    },
                ),
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : undefined;

            this.logger.error(`postQuotes callback flow failed for quoteId=${request.quoteId}`, stack ?? message);
            let callbackError = error;
            let callbackAuditError = AuditErrorConverter.toAuditError(error);
            let callbackErrorResponse = AuditErrorConverter.toErrorResponse(callbackAuditError);
            let callbackFspError = AuditErrorConverter.toFspError(error);

            try {
                await this.fspiopAxios.putQuotesError(
                    quotesUrl,
                    headers,
                    request.quoteId,
                    callbackErrorResponse,
                );
            } catch (putError) {
                const putMessage = putError instanceof Error ? putError.message : String(putError);
                const putStack = putError instanceof Error ? putError.stack : undefined;

                this.logger.error(`putQuotesError failed for quoteId=${request.quoteId}`, putStack ?? putMessage);
                callbackError = putError;
                callbackAuditError = AuditErrorConverter.toAuditError(putError);
                callbackErrorResponse = AuditErrorConverter.toErrorResponse(callbackAuditError);
                callbackFspError = callbackFspError ?? AuditErrorConverter.toFspError(putError);
            }

            try {
                await this.auditPublisher.publish(
                    TransactionMessage.error(
                        TransactionMessage.InvocationPhase.Quotes,
                        TransactionMessage.InvocationGateway.Connector,
                        {
                            correlationId: auditCorrelationId,
                            payerFsp,
                            payeeFsp,
                            request,
                            error: callbackFspError == null
                                ? callbackAuditError
                                : {audit: callbackAuditError, fspError: callbackFspError},
                            occurredAt: new Date(),
                        },
                    ),
                );
            } catch (publishError) {
                const publishMessage = publishError instanceof Error ? publishError.message : String(publishError);
                const publishStack = publishError instanceof Error ? publishError.stack : undefined;

                this.logger.error(`audit publish failed for quoteId=${request.quoteId}`, publishStack ?? publishMessage);
                // Preserve the callback error as the command failure.
            }

            FspiopException.rethrow(callbackError);
        }

        return new PerformPostQuotesCommand.Output();
    }

    private static resolveCorrelationId(
        correlationId: string | null,
        ...transactionIdentifiers: Array<string | null | undefined>
    ): string {
        const transactionIdentifier = PerformPostQuotesHandler.firstNonBlank(...transactionIdentifiers);

        if (transactionIdentifier != null) {
            return transactionIdentifier;
        }

        const traceCorrelationId = PerformPostQuotesHandler.firstNonBlank(correlationId);

        if (traceCorrelationId == null) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'traceparent correlationId or transaction identifier is required',
            );
        }

        return traceCorrelationId;
    }

    private static firstNonBlank(...values: Array<string | null | undefined>): string | null {
        for (const value of values) {
            const normalized = value?.trim();

            if (normalized != null && normalized.length > 0) {
                return normalized;
            }
        }

        return null;
    }
}

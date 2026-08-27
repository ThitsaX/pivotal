// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {
    Currency,
    ErrorMessageLanguage,
    FspiopErrors,
    FspiopException,
    FspiopMoney,
    FspiopUserMessages,
    TransferState,
} from '@shared/fspiop';
import {StateEnum, TransferStatusError} from '../dto';
import {TransferStatusRecord, TransferStatusRepository} from '../component';
import {GetTransferStatusQuery} from './get-transfer-status.query';

@QueryHandler(GetTransferStatusQuery)
export class GetTransferStatusHandler
    implements IQueryHandler<GetTransferStatusQuery, GetTransferStatusQuery.Output> {

    private static readonly DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

    constructor(
        @Inject(TransferStatusRepository)
        private readonly repository: TransferStatusRepository,
    ) {
    }

    async execute(query: GetTransferStatusQuery): Promise<GetTransferStatusQuery.Output> {
        const {transferId, requesterFspId, language} = query.input;
        const record = await this.repository.get(transferId);

        if (record == null || !GetTransferStatusHandler.isVisibleTo(record, requesterFspId)) {
            throw new FspiopException(
                FspiopErrors.TRANSFER_ID_NOT_FOUND,
                'Transfer ID not found.',
            );
        }

        const currentState = GetTransferStatusHandler.toCurrentState(record);
        const output = new GetTransferStatusQuery.Output();
        output.transferId = transferId;
        output.homeTransactionId = requesterFspId === record.payeeFsp
            ? GetTransferStatusHandler.toNullableString(record.payeeHomeTransactionId)
            : GetTransferStatusHandler.toNullableString(record.payerHomeTransactionId);
        output.currentState = currentState;
        output.possibleDispute = record.possibleDispute === true || record.possibleDispute === 1;
        output.amount = GetTransferStatusHandler.toDecimalString(record.quotingAmount);
        output.currency = GetTransferStatusHandler.toCurrency(record.quotingCurrency);
        output.initiatedTimestamp = GetTransferStatusHandler.toIsoTimestamp(record.transactionStartedAt);
        output.errorInformation = currentState === StateEnum.Aborted
            ? GetTransferStatusHandler.toError(record, language)
            : null;

        return output;
    }

    private static isVisibleTo(record: TransferStatusRecord, requesterFspId: string): boolean {
        return record.payerFsp === requesterFspId || record.payeeFsp === requesterFspId;
    }

    private static toCurrentState(record: TransferStatusRecord): StateEnum {
        switch (record.transferState) {
            case TransferState.Committed:
                return StateEnum.Completed;
        }

        if (record.error === true || record.error === 1) {
            return StateEnum.Aborted;
        }

        const flow = typeof record.flow === 'string' ? Number(record.flow) : record.flow;

        // `flow` is stamped when the stage is *requested*, so it alone cannot tell a
        // callback still in flight at the Hub from one that has landed. The responded-at
        // timestamps make that distinction: a WAITING_* state is only true once the
        // callback arrived and the next move is genuinely the payer's. Without this,
        // a DFSP polling mid-quote is told to send PUT acceptQuote a second time.
        if (flow === 2 && record.quotesRespondedAt != null && record.transfersRequestedAt == null) {
            return StateEnum.WaitingForQuoteAcceptance;
        }

        if (flow === 1 && record.partiesRespondedAt != null && record.quotesRequestedAt == null) {
            return StateEnum.WaitingForPartyAcceptance;
        }

        return StateEnum.Pending;
    }

    private static toError(
        record: TransferStatusRecord,
        language: ErrorMessageLanguage,
    ): TransferStatusError {
        const rawError = record.transfersError
            ?? record.quotesError
            ?? record.partiesError
            ?? record.patchError;
        const parsed = GetTransferStatusHandler.parseJson(rawError);
        const root = GetTransferStatusHandler.toRecord(parsed);
        const errorInformation = GetTransferStatusHandler.toRecord(root?.['errorInformation']) ?? root;
        const statusCode = GetTransferStatusHandler.firstString(
            errorInformation?.['statusCode'],
            errorInformation?.['errorCode'],
            root?.['statusCode'],
            root?.['errorCode'],
        ) ?? FspiopErrors.GENERIC_SERVER_ERROR.errorType.code;
        const defaultMessage = FspiopUserMessages.messageFor(
            statusCode,
            FspiopUserMessages.DEFAULT_LANGUAGE,
        );
        const detailedDescription = GetTransferStatusHandler.firstString(
            root?.['detailedDescription'],
            errorInformation?.['detailedDescription'],
            errorInformation?.['errorDescription'],
            root?.['errorDescription'],
            typeof parsed === 'string' ? parsed : undefined,
        ) ?? FspiopErrors.find(statusCode)?.description
            ?? FspiopErrors.GENERIC_SERVER_ERROR.description;

        const error = new TransferStatusError();
        error.statusCode = statusCode;
        error.message = GetTransferStatusHandler.firstString(root?.['message']) ?? defaultMessage;
        error.localeMessage = GetTransferStatusHandler.firstString(root?.['localeMessage'])
            ?? FspiopUserMessages.messageFor(statusCode, language);
        error.detailedDescription = detailedDescription;

        return error;
    }

    /**
     * `getRawOne` bypasses the entity's decimal transformer, so mysql2 hands back the
     * DECIMAL(34,4) column verbatim - "10000.0000" for an amount the payer sent as
     * "10000". Normalizing through the same helper that normalized the payer's
     * `POST /sendmoney` amount is what lets a DFSP reconcile the two by string
     * comparison, which is the whole point of this endpoint.
     *
     * Kept textual on purpose: DECIMAL(34,4) holds 30 integer digits, so a round trip
     * through Number would lose precision and emit exponent notation.
     */
    private static toDecimalString(value: unknown): string | null {
        const text = typeof value === 'number'
            ? (Number.isFinite(value) ? value.toString() : '')
            : typeof value === 'string' ? value.trim() : '';

        if (!GetTransferStatusHandler.DECIMAL_PATTERN.test(text)) {
            return null;
        }

        return FspiopMoney.normalizeAmount(text);
    }

    private static toCurrency(value: unknown): Currency | null {
        return Object.values(Currency).includes(value as Currency)
            ? value as Currency
            : null;
    }

    private static toIsoTimestamp(value: Date | string): string {
        return new Date(value).toISOString();
    }

    private static parseJson(value: unknown): unknown {
        if (typeof value !== 'string') {
            return value;
        }

        const normalized = value.trim();
        if (normalized.length === 0) {
            return value;
        }

        try {
            return JSON.parse(normalized) as unknown;
        } catch {
            return value;
        }
    }

    private static toRecord(value: unknown): Record<string, unknown> | undefined {
        return typeof value === 'object' && value != null && !Array.isArray(value)
            ? value as Record<string, unknown>
            : undefined;
    }

    private static toNullableString(value: unknown): string | null {
        if (typeof value !== 'string') {
            return null;
        }

        const normalized = value.trim();
        return normalized.length > 0 ? normalized : null;
    }

    private static firstString(...values: unknown[]): string | undefined {
        for (const value of values) {
            const normalized = GetTransferStatusHandler.toNullableString(value);
            if (normalized != null) {
                return normalized;
            }
        }

        return undefined;
    }
}

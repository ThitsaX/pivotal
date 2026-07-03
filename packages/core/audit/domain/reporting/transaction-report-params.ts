// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {FindTransactionsQuery} from '../query/find-transactions.query';

export class TransactionReportParams {

    static fromInput(
        criteria: FindTransactionsQuery.Criteria,
        order: FindTransactionsQuery.Order,
        accessScope?: FindTransactionsQuery.AccessScope,
    ): Record<string, string> {
        return {
            payerFsp:                     criteria.payerFsp ?? '',
            payeeFsp:                     criteria.payeeFsp ?? '',
            payerIdType:                  criteria.payerIdType ?? '',
            payerId:                      criteria.payerId ?? '',
            payerSubId:                   TransactionReportParams.nullableToParam(criteria.payerSubId),
            payeeIdType:                  criteria.payeeIdType ?? '',
            payeeId:                      criteria.payeeId ?? '',
            payeeSubId:                   TransactionReportParams.nullableToParam(criteria.payeeSubId),
            transferId:                   criteria.transferId ?? '',
            flow:                         criteria.flow == null ? '' : String(criteria.flow),
            transferType:                 criteria.transferType ?? '',
            subScenario:                  criteria.subScenario ?? '',
            transactionStartAtStart:      criteria.transactionStartAt?.startInclusive?.toISOString() ?? '',
            transactionStartAtEnd:        criteria.transactionStartAt?.endExclusive?.toISOString() ?? '',
            error:                        criteria.error == null ? '' : String(criteria.error),
            dispute:                      criteria.dispute == null ? '' : String(criteria.dispute),
            orderColumn:                  order.column,
            orderDirection:               order.direction,
            accessFspId:                  accessScope?.fspId ?? '',
        };
    }

    static toCriteria(params: Record<string, string>): FindTransactionsQuery.Criteria {
        return new FindTransactionsQuery.Criteria(
            TransactionReportParams.emptyToUndefined(params.payerFsp),
            TransactionReportParams.emptyToUndefined(params.payeeFsp),
            TransactionReportParams.emptyToUndefined(params.payerIdType) as any,
            TransactionReportParams.emptyToUndefined(params.payerId),
            TransactionReportParams.paramToNullable(params.payerSubId),
            TransactionReportParams.emptyToUndefined(params.payeeIdType) as any,
            TransactionReportParams.emptyToUndefined(params.payeeId),
            TransactionReportParams.paramToNullable(params.payeeSubId),
            TransactionReportParams.emptyToUndefined(params.transferId),
            TransactionReportParams.toOptionalInteger(params.flow),
            TransactionReportParams.emptyToUndefined(params.transferType) as any,
            TransactionReportParams.emptyToUndefined(params.subScenario),
            TransactionReportParams.toDateRange(params.transactionStartAtStart, params.transactionStartAtEnd),
            TransactionReportParams.toOptionalBoolean(params.error),
            TransactionReportParams.toOptionalBoolean(params.dispute),
        );
    }

    static toOrder(params: Record<string, string>): FindTransactionsQuery.Order {
        return new FindTransactionsQuery.Order(
            (TransactionReportParams.emptyToUndefined(params.orderColumn) ??
                FindTransactionsQuery.Order.Column.TransactionStartAt) as FindTransactionsQuery.Order.Column,
            (TransactionReportParams.emptyToUndefined(params.orderDirection) ??
                FindTransactionsQuery.Order.Direction.Desc) as FindTransactionsQuery.Order.Direction,
        );
    }

    static toAccessScope(params: Record<string, string>): FindTransactionsQuery.AccessScope | undefined {
        const fspId = TransactionReportParams.emptyToUndefined(params.accessFspId);

        return fspId == null ? undefined : new FindTransactionsQuery.AccessScope(fspId);
    }

    private static nullableToParam(value: string | null | undefined): string {
        if (value === null) {
            return 'null';
        }

        return value ?? '';
    }

    private static paramToNullable(value: string | undefined): string | null | undefined {
        const normalized = TransactionReportParams.emptyToUndefined(value);

        if (normalized == null) {
            return undefined;
        }

        return normalized.toLowerCase() === 'null' ? null : normalized;
    }

    private static toOptionalInteger(value: string | undefined): number | undefined {
        const normalized = TransactionReportParams.emptyToUndefined(value);

        return normalized == null ? undefined : Number(normalized);
    }

    private static toOptionalBoolean(value: string | undefined): boolean | undefined {
        const normalized = TransactionReportParams.emptyToUndefined(value);

        if (normalized == null) {
            return undefined;
        }

        return normalized === 'true';
    }

    private static toDateRange(
        startValue: string | undefined,
        endValue: string | undefined,
    ): FindTransactionsQuery.DateRange | undefined {
        const start = TransactionReportParams.emptyToUndefined(startValue);
        const end = TransactionReportParams.emptyToUndefined(endValue);

        if (start == null && end == null) {
            return undefined;
        }

        return new FindTransactionsQuery.DateRange(
            start == null ? undefined : new Date(start),
            end == null ? undefined : new Date(end),
        );
    }

    private static emptyToUndefined(value: string | undefined): string | undefined {
        if (value == null || value.length === 0) {
            return undefined;
        }

        return value;
    }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {BadRequestException, Controller, Get, Inject, Param, Query} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {
    AccessTokenClaims,
    PermissionKey,
    RequiresPermission,
} from '@core/auth/domain';
import {CountTransactionsQuery, FindTransactionsQuery, GetTransactionQuery} from '@core/audit/domain';
import {PartyIdType, TransactionScenario} from '@shared/fspiop';
import {AuthUser} from '../../decorators';
import {QueryParamsUtil} from '../query-params.util';
import {AUDIT_MAX_LIMIT} from './audit.tokens';

@Controller('audit/transactions')
export class TransactionsAuditController {

    // Backend safety-net default window when the caller sends no range and no point lookup.
    // The hard protection is MAX_LIMIT, not this window.
    private static readonly DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
        @Inject(AUDIT_MAX_LIMIT)
        private readonly maxLimit: number,
    ) {
    }

    @Get()
    @RequiresPermission(PermissionKey.AUDIT_TRANSACTIONS_LIST)
    async findTransactions(
        @AuthUser() claims: AccessTokenClaims | undefined,
        @Query('payerFsp') payerFsp: string | undefined,
        @Query('payeeFsp') payeeFsp: string | undefined,
        @Query('payerIdType') payerIdType: string | undefined,
        @Query('payerId') payerId: string | undefined,
        @Query('payerSubId') payerSubId: string | undefined,
        @Query('payeeIdType') payeeIdType: string | undefined,
        @Query('payeeId') payeeId: string | undefined,
        @Query('payeeSubId') payeeSubId: string | undefined,
        @Query('transferId') transferId: string | undefined,
        @Query('flow') flow: string | undefined,
        @Query('transferType') transferType: string | undefined,
        @Query('subScenario') subScenario: string | undefined,
        @Query('transactionStartAtStart') transactionStartAtStart: string | undefined,
        @Query('transactionStartAtEnd') transactionStartAtEnd: string | undefined,
        @Query('error') error: string | undefined,
        @Query('dispute') dispute: string | undefined,
        @Query('cursor') cursor: string | undefined,
        @Query('direction') direction: string | undefined,
        @Query('size') size: string | undefined,
        @Query('orderColumn') orderColumn: string | undefined,
        @Query('orderDirection') orderDirection: string | undefined,
    ): Promise<FindTransactionsQuery.Output> {
        const accessScope = TransactionsAuditController.resolveListAccessScope(claims, payerFsp, payeeFsp);

        const criteria = TransactionsAuditController.buildCriteria({
            payerFsp,
            payeeFsp,
            payerIdType,
            payerId,
            payerSubId,
            payeeIdType,
            payeeId,
            payeeSubId,
            transferId,
            flow,
            transferType,
            subScenario,
            transactionStartAtStart,
            transactionStartAtEnd,
            error,
            dispute,
        });

        const cursorRequest = TransactionsAuditController.resolveCursor(cursor, direction, size);

        const order = new FindTransactionsQuery.Order(
            QueryParamsUtil.toEnum(
                orderColumn,
                FindTransactionsQuery.Order.Column,
                FindTransactionsQuery.Order.Column.TransactionStartAt,
                'orderColumn',
            ),
            QueryParamsUtil.toEnum(
                orderDirection,
                FindTransactionsQuery.Order.Direction,
                FindTransactionsQuery.Order.Direction.Desc,
                'orderDirection',
            ),
        );

        return this.queryBus.execute(
            new FindTransactionsQuery(
                new FindTransactionsQuery.Input(criteria, cursorRequest, order, accessScope),
            ),
        );
    }

    @Get('count')
    @RequiresPermission(PermissionKey.AUDIT_TRANSACTIONS_LIST)
    async countTransactions(
        @AuthUser() claims: AccessTokenClaims | undefined,
        @Query('payerFsp') payerFsp: string | undefined,
        @Query('payeeFsp') payeeFsp: string | undefined,
        @Query('payerIdType') payerIdType: string | undefined,
        @Query('payerId') payerId: string | undefined,
        @Query('payerSubId') payerSubId: string | undefined,
        @Query('payeeIdType') payeeIdType: string | undefined,
        @Query('payeeId') payeeId: string | undefined,
        @Query('payeeSubId') payeeSubId: string | undefined,
        @Query('transferId') transferId: string | undefined,
        @Query('flow') flow: string | undefined,
        @Query('transferType') transferType: string | undefined,
        @Query('subScenario') subScenario: string | undefined,
        @Query('transactionStartAtStart') transactionStartAtStart: string | undefined,
        @Query('transactionStartAtEnd') transactionStartAtEnd: string | undefined,
        @Query('error') error: string | undefined,
        @Query('dispute') dispute: string | undefined,
    ): Promise<CountTransactionsQuery.Output> {
        const accessScope = TransactionsAuditController.resolveListAccessScope(claims, payerFsp, payeeFsp);

        const criteria = TransactionsAuditController.buildCriteria({
            payerFsp,
            payeeFsp,
            payerIdType,
            payerId,
            payerSubId,
            payeeIdType,
            payeeId,
            payeeSubId,
            transferId,
            flow,
            transferType,
            subScenario,
            transactionStartAtStart,
            transactionStartAtEnd,
            error,
            dispute,
        });

        return this.queryBus.execute(
            new CountTransactionsQuery(
                new CountTransactionsQuery.Input(this.maxLimit, criteria, accessScope),
            ),
        );
    }

    @Get(':transferId')
    @RequiresPermission(PermissionKey.AUDIT_TRANSACTIONS_VIEW)
    async getTransaction(
        @AuthUser() claims: AccessTokenClaims | undefined,
        @Param('transferId') transferId: string,
    ): Promise<GetTransactionQuery.Output> {
        const accessScope = TransactionsAuditController.resolveDetailAccessScope(claims);

        return this.queryBus.execute(
            new GetTransactionQuery(
                new GetTransactionQuery.Input(transferId, accessScope),
            ),
        );
    }

    private static buildCriteria(
        params: TransactionsAuditController.CriteriaParams,
    ): FindTransactionsQuery.Criteria {
        const transferId = QueryParamsUtil.toOptionalString(params.transferId);

        const transactionStartAt = TransactionsAuditController.resolveStartWindow(
            params.transactionStartAtStart,
            params.transactionStartAtEnd,
            transferId,
        );

        return new FindTransactionsQuery.Criteria(
            QueryParamsUtil.toOptionalString(params.payerFsp),
            QueryParamsUtil.toOptionalString(params.payeeFsp),
            QueryParamsUtil.toOptionalEnum(params.payerIdType, PartyIdType, 'payerIdType'),
            QueryParamsUtil.toOptionalString(params.payerId),
            QueryParamsUtil.toOptionalNullableString(params.payerSubId),
            QueryParamsUtil.toOptionalEnum(params.payeeIdType, PartyIdType, 'payeeIdType'),
            QueryParamsUtil.toOptionalString(params.payeeId),
            QueryParamsUtil.toOptionalNullableString(params.payeeSubId),
            transferId,
            QueryParamsUtil.toOptionalInteger(params.flow, 'flow'),
            QueryParamsUtil.toOptionalEnum(params.transferType, TransactionScenario, 'transferType'),
            QueryParamsUtil.toOptionalString(params.subScenario),
            transactionStartAt,
            QueryParamsUtil.toOptionalBoolean(params.error, 'error'),
            QueryParamsUtil.toOptionalBoolean(params.dispute, 'dispute'),
        );
    }

    /**
     * Resolves the Transaction Start window. If the caller supplied an explicit range it is
     * used verbatim (no time-span ceiling — bounded by MAX_LIMIT instead). Otherwise a rolling
     * last-24h window is injected as a sensible default, EXCEPT for `transferId` point lookups,
     * which are exempt.
     */
    private static resolveStartWindow(
        startValue: string | undefined,
        endValue: string | undefined,
        transferId: string | undefined,
    ): FindTransactionsQuery.DateRange | undefined {
        const explicit = QueryParamsUtil.toDateRange(
            startValue,
            endValue,
            'transactionStartAtStart',
            'transactionStartAtEnd',
            (start?: Date, end?: Date) => new FindTransactionsQuery.DateRange(start, end),
        );

        if (explicit !== undefined) {
            return explicit;
        }

        if (transferId !== undefined) {
            return undefined;
        }

        const start = new Date(Date.now() - TransactionsAuditController.DEFAULT_WINDOW_MS);

        return new FindTransactionsQuery.DateRange(start, undefined);
    }

    private static resolveCursor(
        cursor: string | undefined,
        direction: string | undefined,
        size: string | undefined,
    ): FindTransactionsQuery.Cursor {
        const sizeValue = QueryParamsUtil.toPositiveInteger(size, 20, 'size');
        const token = QueryParamsUtil.toOptionalString(cursor);

        let position = TransactionsAuditController.toCursorPosition(direction, token);

        // Next/Prev are meaningless without a token — fall back to the first page.
        if (
            (position === FindTransactionsQuery.Cursor.Position.Next ||
                position === FindTransactionsQuery.Cursor.Position.Prev) &&
            token == null
        ) {
            position = FindTransactionsQuery.Cursor.Position.First;
        }

        const effectiveToken =
            position === FindTransactionsQuery.Cursor.Position.Next ||
            position === FindTransactionsQuery.Cursor.Position.Prev
                ? token
                : undefined;

        return new FindTransactionsQuery.Cursor(position, effectiveToken, sizeValue);
    }

    private static toCursorPosition(
        direction: string | undefined,
        token: string | undefined,
    ): FindTransactionsQuery.Cursor.Position {
        switch ((direction ?? '').trim().toLowerCase()) {
            case 'next':
                return FindTransactionsQuery.Cursor.Position.Next;
            case 'prev':
            case 'previous':
                return FindTransactionsQuery.Cursor.Position.Prev;
            case 'last':
                return FindTransactionsQuery.Cursor.Position.Last;
            case 'first':
                return FindTransactionsQuery.Cursor.Position.First;
            default:
                return token != null
                    ? FindTransactionsQuery.Cursor.Position.Next
                    : FindTransactionsQuery.Cursor.Position.First;
        }
    }

    private static resolveListAccessScope(
        claims: AccessTokenClaims | undefined,
        payerFsp: string | undefined,
        payeeFsp: string | undefined,
    ): FindTransactionsQuery.AccessScope | undefined {

        if (claims == null || claims.fspId == null) {
            return undefined;
        }

        const scopedFspId = claims.fspId;
        const payer = QueryParamsUtil.toOptionalString(payerFsp);
        const payee = QueryParamsUtil.toOptionalString(payeeFsp);

        if (
            payer !== undefined
            && payee !== undefined
            && payer !== scopedFspId
            && payee !== scopedFspId
        ) {
            throw new BadRequestException({
                code: 'AUTH_FSP_SCOPE_VIOLATION',
                message: 'Either payerFsp or payeeFsp must match the caller fspId.',
            });
        }

        return new FindTransactionsQuery.AccessScope(scopedFspId);
    }

    private static resolveDetailAccessScope(
        claims: AccessTokenClaims | undefined,
    ): GetTransactionQuery.AccessScope | undefined {

        if (claims == null || claims.fspId == null) {
            return undefined;
        }

        return new GetTransactionQuery.AccessScope(claims.fspId);
    }
}

export namespace TransactionsAuditController {

    export type CriteriaParams = {
        payerFsp: string | undefined;
        payeeFsp: string | undefined;
        payerIdType: string | undefined;
        payerId: string | undefined;
        payerSubId: string | undefined;
        payeeIdType: string | undefined;
        payeeId: string | undefined;
        payeeSubId: string | undefined;
        transferId: string | undefined;
        flow: string | undefined;
        transferType: string | undefined;
        subScenario: string | undefined;
        transactionStartAtStart: string | undefined;
        transactionStartAtEnd: string | undefined;
        error: string | undefined;
        dispute: string | undefined;
    };
}

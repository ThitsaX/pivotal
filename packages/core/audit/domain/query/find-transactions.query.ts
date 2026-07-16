// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {PartyIdType, TransactionScenario} from '@shared/fspiop';

export class FindTransactionsQuery {
    constructor(public readonly input: FindTransactionsQuery.Input) {
    }
}

export namespace FindTransactionsQuery {

    export class Input {
        constructor(
            public readonly criteria: Criteria = new Criteria(),
            public readonly cursor: Cursor = new Cursor(),
            public readonly order: Order = new Order(),
            public readonly accessScope?: AccessScope,
        ) {
        }
    }

    export class AccessScope {
        constructor(
            public readonly fspId: string,
        ) {
        }
    }

    export class Criteria {
        constructor(
            public readonly payerFsp?: string,
            public readonly payeeFsp?: string,
            public readonly payerIdType?: PartyIdType,
            public readonly payerId?: string,
            public readonly payerSubId?: string | null,
            public readonly payeeIdType?: PartyIdType,
            public readonly payeeId?: string,
            public readonly payeeSubId?: string | null,
            public readonly transferId?: string,
            public readonly payerHomeTransactionId?: string,
            public readonly payeeHomeTransactionId?: string,
            public readonly flow?: number,
            public readonly transferType?: TransactionScenario,
            public readonly subScenario?: string,
            public readonly transactionStartAt?: DateRange,
            public readonly error?: boolean,
            public readonly dispute?: boolean,
        ) {
        }
    }

    export class DateRange {
        constructor(
            public readonly startInclusive?: Date,
            public readonly endExclusive?: Date,
        ) {
        }
    }

    /**
     * Keyset (cursor) navigation request. Replaces offset pagination.
     *
     * - `First`           — newest page (no token).
     * - `Next` / `Prev`   — relative to `token` (the opaque cursor of the boundary row).
     * - `Last`            — oldest page (no token).
     *
     * `size` is the page size; the repository fetches `size + 1` rows internally to
     * derive `hasNext` / `hasPrev` without a `COUNT(*)`.
     */
    export class Cursor {
        constructor(
            public readonly position: Cursor.Position = Cursor.Position.First,
            public readonly token?: string,
            public readonly size: number = 20,
        ) {
        }
    }

    export namespace Cursor {
        export enum Position {
            First = 'first',
            Last = 'last',
            Next = 'next',
            Prev = 'prev',
        }
    }

    export class Order {
        constructor(
            public readonly column: Order.Column = Order.Column.TransactionStartAt,
            public readonly direction: Order.Direction = Order.Direction.Desc,
        ) {
        }
    }

    export namespace Order {

        export enum Column {
            CorrelationId = 'correlationId',
            TransactionStartAt = 'transactionStartAt',
            TransactionCompletedAt = 'transactionCompletedAt',
        }

        export enum Direction {
            Asc = 'ASC',
            Desc = 'DESC',
        }
    }

    export class PageInfo {
        constructor(
            public readonly hasNext: boolean,
            public readonly hasPrev: boolean,
            public readonly startCursor?: string,
            public readonly endCursor?: string,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly records: Record<string, unknown>[],
            public readonly pageInfo: PageInfo,
        ) {
        }
    }
}

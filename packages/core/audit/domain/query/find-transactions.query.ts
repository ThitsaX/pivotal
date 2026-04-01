import {PartyIdType, TransactionScenario} from '@shared/fspiop';

export class FindTransactionsQuery {
    constructor(public readonly input: FindTransactionsQuery.Input) {
    }
}

export namespace FindTransactionsQuery {

    export class Input {
        constructor(
            public readonly criteria: Criteria = new Criteria(),
            public readonly pageRequest: PageRequest = new PageRequest(),
            public readonly order: Order = new Order(),
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
            public readonly flow?: number,
            public readonly transferType?: TransactionScenario,
            public readonly subScenario?: string,
            public readonly transactionStartAt?: DateRange,
            public readonly transactionCompletedAt?: DateRange,
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

    export class PageRequest {
        constructor(
            public readonly page: number = 0,
            public readonly size: number = 20,
        ) {
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
            Id = 'id',
            CorrelationId = 'correlationId',
            PayerFsp = 'payerFsp',
            PayeeFsp = 'payeeFsp',
            PayerId = 'payerId',
            PayeeId = 'payeeId',
            TransferType = 'transferType',
            SubScenario = 'subScenario',
            TransactionStartAt = 'transactionStartAt',
            TransactionCompletedAt = 'transactionCompletedAt',
            Error = 'error',
            Dispute = 'dispute',
        }

        export enum Direction {
            Asc = 'ASC',
            Desc = 'DESC',
        }
    }

    export class Output {
        constructor(
            public readonly records: Record<string, unknown>[],
            public readonly totalRecords: number,
            public readonly pageRequest: PageRequest,
        ) {
        }
    }
}

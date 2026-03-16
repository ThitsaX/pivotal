import {InboundTransfers} from '../model';

export class FindInboundTransfersQuery {
    constructor(public readonly input: FindInboundTransfersQuery.Input) {
    }
}

export namespace FindInboundTransfersQuery {

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
            public readonly transferId?: string,
            public readonly createdAt?: DateRange,
            public readonly completedAt?: DateRange,
            public readonly error?: boolean,
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
            public readonly column: Order.Column = Order.Column.CreatedAt,
            public readonly direction: Order.Direction = Order.Direction.Desc,
        ) {
        }
    }

    export namespace Order {

        export enum Column {
            Id = 'id',
            PayerFsp = 'payerFsp',
            PayeeFsp = 'payeeFsp',
            TransferId = 'transferId',
            CreatedAt = 'createdAt',
            CompletedAt = 'completedAt',
            Error = 'failed',
        }

        export enum Direction {
            Asc = 'ASC',
            Desc = 'DESC',
        }
    }

    export class Output {
        constructor(
            public readonly records: InboundTransfers[],
            public readonly totalRecords: number,
            public readonly pageRequest: PageRequest,
        ) {
        }
    }
}

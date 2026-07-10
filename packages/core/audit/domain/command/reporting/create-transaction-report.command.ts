// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {FindTransactionsQuery} from '../../query/find-transactions.query';

export class CreateTransactionReportCommand {
    constructor(public readonly input: CreateTransactionReportCommand.Input) {
    }
}

export namespace CreateTransactionReportCommand {

    export class Input {
        constructor(
            public readonly criteria: FindTransactionsQuery.Criteria,
            public readonly order: FindTransactionsQuery.Order,
            public readonly fileType: string,
            public readonly requestedByUserId?: string | null,
            public readonly accessScope?: FindTransactionsQuery.AccessScope,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly requestId: string,
            public readonly status: string,
            public readonly paramsSignature: string,
        ) {
        }
    }
}

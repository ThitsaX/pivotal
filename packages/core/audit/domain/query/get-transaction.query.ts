// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class GetTransactionQuery {
    constructor(public readonly input: GetTransactionQuery.Input) {
    }
}

export namespace GetTransactionQuery {

    export class Input {
        constructor(
            public readonly transferId: string,
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

    export class Output {
        constructor(
            public readonly record: Record<string, unknown>,
        ) {
        }
    }
}

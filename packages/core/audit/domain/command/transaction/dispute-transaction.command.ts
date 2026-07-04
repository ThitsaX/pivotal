// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export class DisputeTransactionCommand {
    constructor(public readonly input: DisputeTransactionCommand.Input) {
    }
}

export namespace DisputeTransactionCommand {

    export class Input {
        constructor(public readonly correlationId: string) {
        }
    }

    export class Output {
        constructor(public readonly id: string) {
        }
    }
}

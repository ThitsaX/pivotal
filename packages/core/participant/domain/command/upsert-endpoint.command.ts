// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export class UpsertEndpointCommand {
    constructor(public readonly input: UpsertEndpointCommand.Input) {
    }
}

export namespace UpsertEndpointCommand {

    export class Input {
        constructor(
            public readonly name: string,
            public readonly endpoint: string,
        ) {
        }
    }

    export class Output {
        constructor(public readonly participantId: string) {
        }
    }
}

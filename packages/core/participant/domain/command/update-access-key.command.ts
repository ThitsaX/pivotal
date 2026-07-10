// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class UpdateAccessKeyCommand {
    constructor(public readonly input: UpdateAccessKeyCommand.Input) {
    }
}

export namespace UpdateAccessKeyCommand {

    export class Input {
        constructor(
            public readonly name: string,
            public readonly accessPublicKey: string,
        ) {
        }
    }

    export class Output {
        constructor(public readonly participantId: string) {
        }
    }
}

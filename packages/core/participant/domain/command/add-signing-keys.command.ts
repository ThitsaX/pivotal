// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class AddSigningKeysCommand {
    constructor(public readonly input: AddSigningKeysCommand.Input) {
    }
}

export namespace AddSigningKeysCommand {

    export class Input {
        constructor(
            public readonly name: string,
            public readonly jwsPublicKey: string,
            public readonly jwsPrivateKey: string,
        ) {
        }
    }

    export class Output {
        constructor(public readonly participantId: string) {
        }
    }
}

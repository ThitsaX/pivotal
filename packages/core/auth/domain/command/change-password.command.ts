// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class ChangePasswordCommand {

    constructor(public readonly input: ChangePasswordCommand.Input) {
    }
}

export namespace ChangePasswordCommand {

    export class Input {
        constructor(
            public readonly userId: string,
            public readonly currentPassword: string,
            public readonly newPassword: string,
        ) {
        }
    }

    export class Output {
        constructor(public readonly changed: boolean) {
        }
    }
}

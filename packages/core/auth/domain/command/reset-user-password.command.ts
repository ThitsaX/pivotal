// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Role, User} from '../model';

export class ResetUserPasswordCommand {

    constructor(public readonly input: ResetUserPasswordCommand.Input) {
    }
}

export namespace ResetUserPasswordCommand {

    export class Input {
        constructor(
            public readonly targetUserId: string,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly user:         User,
            public readonly role:         Role,
            public readonly tempPassword: string,
        ) {
        }
    }
}

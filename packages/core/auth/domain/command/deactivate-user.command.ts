// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Role, User} from '../model';

export class DeactivateUserCommand {

    constructor(public readonly input: DeactivateUserCommand.Input) {
    }
}

export namespace DeactivateUserCommand {

    export class Input {
        constructor(
            public readonly targetUserId: string,
            public readonly actingUserId: string,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly user: User,
            public readonly role: Role,
        ) {
        }
    }
}

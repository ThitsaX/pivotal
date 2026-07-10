// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Role, User} from '../model';

export class UpdateUserCommand {

    constructor(public readonly input: UpdateUserCommand.Input) {
    }
}

export namespace UpdateUserCommand {

    export class Input {
        constructor(
            public readonly targetUserId:     string,
            public readonly actingUserId:     string,
            public readonly roleId?:          string,
            public readonly fspId?:           string | null,
            public readonly isActive?:        boolean,
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

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export class DeleteRoleCommand {

    constructor(public readonly input: DeleteRoleCommand.Input) {
    }
}

export namespace DeleteRoleCommand {

    export class Input {
        constructor(
            public readonly roleId: string,
        ) {
        }
    }

    export class Output {
        constructor(public readonly deleted: boolean) {
        }
    }
}

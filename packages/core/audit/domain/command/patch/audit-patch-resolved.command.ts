// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class AuditPatchResolvedCommand {
    constructor(public readonly input: AuditPatchResolvedCommand.Input) {
    }
}

export namespace AuditPatchResolvedCommand {

    export class Input {
        constructor(
            public readonly correlationId: string,
            public readonly occurredAt: Date,
        ) {
        }
    }

    export class Output {
        constructor(public readonly resolved: boolean) {
        }
    }
}

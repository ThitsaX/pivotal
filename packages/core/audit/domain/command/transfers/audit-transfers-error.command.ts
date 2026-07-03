// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {TransactionMessage} from '@core/audit/common';

export class AuditTransfersErrorCommand {
    constructor(public readonly input: AuditTransfersErrorCommand.Input) {
    }
}

export namespace AuditTransfersErrorCommand {

    export class Input {
        constructor(
            public readonly correlationId: string,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly gateway: TransactionMessage.InvocationGateway,
            public readonly request: unknown | null,
            public readonly error: unknown | null,
            public readonly occurredAt: Date | null = null,
        ) {
        }
    }

    export class Output {
    }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {TransactionMessage} from '@core/audit/common';

export class AuditTransfersRequestCommand {
    constructor(public readonly input: AuditTransfersRequestCommand.Input) {
    }
}

export namespace AuditTransfersRequestCommand {

    export class Input {
        constructor(
            public readonly correlationId: string,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly gateway: TransactionMessage.InvocationGateway,
            public readonly request: unknown | null,
            public readonly occurredAt: Date | null = null,
        ) {
        }
    }

    export class Output {
    }
}

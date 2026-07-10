// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {TransactionMessage} from '@core/audit/common';
import {PartyIdType, TransactionInitiatorType, TransactionScenario} from '@shared/fspiop';

export class AuditPartiesRequestCommand {
    constructor(public readonly input: AuditPartiesRequestCommand.Input) {
    }
}

export namespace AuditPartiesRequestCommand {

    export class Input {
        constructor(
            public readonly correlationId: string,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly payerIdType: PartyIdType | null,
            public readonly payerId: string | null,
            public readonly payerSubId: string | null,
            public readonly payeeIdType: PartyIdType | null,
            public readonly payeeId: string | null,
            public readonly payeeSubId: string | null,
            public readonly transactionInitiatorType: TransactionInitiatorType | null,
            public readonly transactionType: TransactionScenario | null,
            public readonly subScenario: string | null,
            public readonly gateway: TransactionMessage.InvocationGateway,
            public readonly request: unknown | null = null,
            public readonly payerHomeTransactionId: string | null = null,
            public readonly occurredAt: Date | null = null,
        ) {
        }
    }

    export class Output {
    }
}

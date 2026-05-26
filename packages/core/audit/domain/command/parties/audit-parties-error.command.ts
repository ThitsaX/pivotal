import {TransactionMessage} from '@core/audit/common';
import {PartyIdType} from '@shared/fspiop';

export class AuditPartiesErrorCommand {
    constructor(public readonly input: AuditPartiesErrorCommand.Input) {
    }
}

export namespace AuditPartiesErrorCommand {

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
            public readonly gateway: TransactionMessage.InvocationGateway,
            public readonly error: unknown | null,
            public readonly occurredAt: Date | null = null,
        ) {
        }
    }

    export class Output {
    }
}

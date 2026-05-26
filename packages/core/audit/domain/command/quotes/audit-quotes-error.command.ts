import {TransactionMessage} from '@core/audit/common';

export class AuditQuotesErrorCommand {
    constructor(public readonly input: AuditQuotesErrorCommand.Input) {
    }
}

export namespace AuditQuotesErrorCommand {

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

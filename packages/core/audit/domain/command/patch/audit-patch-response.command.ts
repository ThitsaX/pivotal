import {TransactionMessage} from '@core/audit/common';

export class AuditPatchResponseCommand {
    constructor(public readonly input: AuditPatchResponseCommand.Input) {
    }
}

export namespace AuditPatchResponseCommand {

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

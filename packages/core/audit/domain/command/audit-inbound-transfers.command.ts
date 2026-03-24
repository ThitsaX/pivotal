import {ErrorInformationObject, TransfersIDPutResponse, TransfersPostRequest} from '@shared/fspiop';

export class AuditInboundTransfersCommand {
    constructor(public readonly input: AuditInboundTransfersCommand.Input) {
    }
}

export namespace AuditInboundTransfersCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly correlationId: string,
            public readonly rail: string,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly transferId: string,
            public readonly request: TransfersPostRequest,
            public readonly response: TransfersIDPutResponse | null = null,
            public readonly error: ErrorInformationObject | null = null,
            public readonly fspError: string | null = null,
            public readonly createdAt: Date,
            public readonly completedAt: Date | null | undefined,
        ) {
        }
    }

    export class Output {
        constructor(public readonly id: string) {
        }
    }
}

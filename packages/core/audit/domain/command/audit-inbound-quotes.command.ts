import {ErrorInformationObject, QuotesIDPutResponse, QuotesPostRequest} from '@shared/fspiop';

export class AuditInboundQuotesCommand {
    constructor(public readonly input: AuditInboundQuotesCommand.Input) {
    }
}

export namespace AuditInboundQuotesCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly rail: string,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly quoteId: string,
            public readonly request: QuotesPostRequest,
            public readonly response: QuotesIDPutResponse | null = null,
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

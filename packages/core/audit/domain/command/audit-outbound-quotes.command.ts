import {ErrorInformationObject, QuotesIDPutResponse, QuotesPostRequest} from '@shared/fspiop';

export class AuditOutboundQuotesCommand {
    constructor(public readonly input: AuditOutboundQuotesCommand.Input) {
    }
}

export namespace AuditOutboundQuotesCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly rail: string,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly quoteId: string,
            public readonly request: QuotesPostRequest,
            public readonly response: QuotesIDPutResponse | null = null,
            public readonly error: ErrorInformationObject | null = null,
            public readonly createdAt?: Date,
            public readonly completedAt?: Date,
        ) {
        }
    }

    export class Output {
        constructor(public readonly id: string) {
        }
    }
}

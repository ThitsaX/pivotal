import {QuotesPostRequest} from '@shared/fspiop';

export class InitiateInboundQuotesCommand {
    constructor(public readonly input: InitiateInboundQuotesCommand.Input) {
    }
}

export namespace InitiateInboundQuotesCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly rail: string,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: bigint,
            public readonly quoteId: string,
            public readonly request: QuotesPostRequest,
        ) {
        }
    }

    export class Output {
        constructor(public readonly id: string) {
        }
    }
}

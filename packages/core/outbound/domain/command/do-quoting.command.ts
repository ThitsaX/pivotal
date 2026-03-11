import {QuotesIDPutResponse, QuotesPostRequest} from '@shared/fspiop';

export class DoQuotingCommand {
    constructor(public readonly input: DoQuotingCommand.Input) {}
}

export namespace DoQuotingCommand {

    export class Input {
        constructor(
            public readonly source: string,
            public readonly destination: string,
            public readonly quoteId: string,
            public readonly request: QuotesPostRequest,
        ) {
        }
    }

    /**
     * Resolved once the PUT /quotes/{ID} callback arrives on the NATS
     * success subject via FspiopResponseSubscriber.
     * Throws FspiopException if the error callback arrives instead, or on timeout.
     */
    export class Output {
        constructor(public readonly response: QuotesIDPutResponse) {
        }
    }
}

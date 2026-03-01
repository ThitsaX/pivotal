import {QuotesIDPutResponse} from '@shared/fspiop';

export class CompleteOutboundQuotesCommand {
    constructor(public readonly input: CompleteOutboundQuotesCommand.Input) {
    }
}

export namespace CompleteOutboundQuotesCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly response: QuotesIDPutResponse | null,
        ) {
        }
    }

    export class Output {
    }
}

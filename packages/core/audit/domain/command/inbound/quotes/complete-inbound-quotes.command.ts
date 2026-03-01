import {QuotesIDPutResponse} from '@shared/fspiop';

export class CompleteInboundQuotesCommand {
    constructor(public readonly input: CompleteInboundQuotesCommand.Input) {
    }
}

export namespace CompleteInboundQuotesCommand {

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

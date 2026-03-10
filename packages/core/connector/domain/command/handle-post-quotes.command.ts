import {QuotesPostRequest} from '@shared/fspiop';

export class HandlePostQuotesCommand {
    constructor(public readonly input: HandlePostQuotesCommand.Input) {
    }
}

export namespace HandlePostQuotesCommand {
    export class Input {
        constructor(public readonly payerFsp: string,
                    public readonly payeeFsp: string,
                    public readonly correlationId: string,
                    public readonly request: QuotesPostRequest) {
        }
    }

    export class Output {
    }
}

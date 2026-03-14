import {QuotesPostRequest} from '@shared/fspiop';

export class PerformPostQuotesCommand {
    constructor(public readonly input: PerformPostQuotesCommand.Input) {
    }
}

export namespace PerformPostQuotesCommand {
    export class Input {
        constructor(public readonly payerFsp: string,
                    public readonly payeeFsp: string,
                    public readonly request: QuotesPostRequest) {
        }
    }

    export class Output {
    }
}

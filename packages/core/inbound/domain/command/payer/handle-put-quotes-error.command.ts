import {ErrorInformationObject} from '@shared/fspiop';

export class HandlePutQuotesErrorCommand {
    constructor(public readonly input: HandlePutQuotesErrorCommand.Input) {
    }
}

export namespace HandlePutQuotesErrorCommand {
    export class Input {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly quoteId: string,
            public readonly error: ErrorInformationObject | null,
        ) {
        }
    }

    export class Output {
    }
}

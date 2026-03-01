import {ErrorInformationObject} from '@shared/fspiop';

export class FailOutboundQuotesCommand {
    constructor(public readonly input: FailOutboundQuotesCommand.Input) {
    }
}

export namespace FailOutboundQuotesCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly error: ErrorInformationObject,
        ) {
        }
    }

    export class Output {
    }
}

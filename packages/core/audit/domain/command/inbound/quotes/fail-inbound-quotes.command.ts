import {ErrorInformationObject} from '@shared/fspiop';

export class FailInboundQuotesCommand {
    constructor(public readonly input: FailInboundQuotesCommand.Input) {
    }
}

export namespace FailInboundQuotesCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly error: ErrorInformationObject,
            public readonly fspError?: string,
        ) {
        }
    }

    export class Output {
    }
}

import {ErrorInformationObject} from '@shared/fspiop';

export class FailInboundPartiesCommand {
    constructor(public readonly input: FailInboundPartiesCommand.Input) {
    }
}

export namespace FailInboundPartiesCommand {

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

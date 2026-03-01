import {ErrorInformationObject} from '@shared/fspiop';

export class FailOutboundPartiesCommand {
    constructor(public readonly input: FailOutboundPartiesCommand.Input) {
    }
}

export namespace FailOutboundPartiesCommand {

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

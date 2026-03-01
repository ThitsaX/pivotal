import {ErrorInformationObject} from '@shared/fspiop';

export class FailOutboundTransfersCommand {
    constructor(public readonly input: FailOutboundTransfersCommand.Input) {
    }
}

export namespace FailOutboundTransfersCommand {

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

import {ErrorInformationObject} from '@shared/fspiop';

export class FailInboundTransfersCommand {
    constructor(public readonly input: FailInboundTransfersCommand.Input) {
    }
}

export namespace FailInboundTransfersCommand {

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

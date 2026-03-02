import {ErrorInformationObject} from '@shared/fspiop';

export class HandlePutTransfersErrorCommand {
    constructor(public readonly input: HandlePutTransfersErrorCommand.Input) {
    }
}

export namespace HandlePutTransfersErrorCommand {
    export class Input {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly transferId: string,
            public readonly error: ErrorInformationObject | null,
        ) {
        }
    }

    export class Output {
    }
}

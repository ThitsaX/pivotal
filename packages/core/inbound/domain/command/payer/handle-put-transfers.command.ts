import {TransfersIDPutResponse} from '@shared/fspiop';

export class HandlePutTransfersCommand {
    constructor(public readonly input: HandlePutTransfersCommand.Input) {
    }
}

export namespace HandlePutTransfersCommand {
    export class Input {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly transferId: string,
            public readonly response: TransfersIDPutResponse | null,
        ) {
        }
    }

    export class Output {
    }
}

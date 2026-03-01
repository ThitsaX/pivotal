import {TransfersIDPutResponse} from '@shared/fspiop';

export class CompleteInboundTransfersCommand {
    constructor(public readonly input: CompleteInboundTransfersCommand.Input) {
    }
}

export namespace CompleteInboundTransfersCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly response: TransfersIDPutResponse | null,
        ) {
        }
    }

    export class Output {
    }
}

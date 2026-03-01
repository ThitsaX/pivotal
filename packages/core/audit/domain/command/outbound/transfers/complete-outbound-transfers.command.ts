import {TransfersIDPutResponse} from '@shared/fspiop';

export class CompleteOutboundTransfersCommand {
    constructor(public readonly input: CompleteOutboundTransfersCommand.Input) {
    }
}

export namespace CompleteOutboundTransfersCommand {

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

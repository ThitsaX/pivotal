import {TransfersPostRequest} from '@shared/fspiop';

export class InitiateOutboundTransfersCommand {
    constructor(public readonly input: InitiateOutboundTransfersCommand.Input) {
    }
}

export namespace InitiateOutboundTransfersCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly rail: string,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: bigint,
            public readonly transferId: string,
            public readonly request: TransfersPostRequest,
        ) {
        }
    }

    export class Output {
        constructor(public readonly id: string) {
        }
    }
}

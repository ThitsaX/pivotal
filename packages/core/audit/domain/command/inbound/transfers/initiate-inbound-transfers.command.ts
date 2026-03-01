import {TransfersPostRequest} from '@shared/fspiop';

export class InitiateInboundTransfersCommand {
    constructor(public readonly input: InitiateInboundTransfersCommand.Input) {
    }
}

export namespace InitiateInboundTransfersCommand {

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

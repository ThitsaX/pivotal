import {TransfersIDPutResponse, TransfersPostRequest} from '@shared/fspiop';

export class DoTransferCommand {
    constructor(public readonly input: DoTransferCommand.Input) {}
}

export namespace DoTransferCommand {

    export class Input {
        constructor(
            public readonly correlationId: string,
            public readonly source: string,
            public readonly destination: string,
            public readonly transferId: string,
            public readonly request: TransfersPostRequest,
        ) {
        }
    }

    /**
     * Resolved once the PUT /transfers/{ID} callback arrives on the NATS
     * success subject via FspiopResponseSubscriber.
     * Throws FspiopException if the error callback arrives instead, or on timeout.
     */
    export class Output {
        constructor(public readonly response: TransfersIDPutResponse) {
        }
    }
}

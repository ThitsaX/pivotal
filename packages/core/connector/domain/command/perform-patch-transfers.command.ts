import {TransfersIDPatchResponse} from '@shared/fspiop';

export class PerformPatchTransfersCommand {
    constructor(public readonly input: PerformPatchTransfersCommand.Input) {
    }
}

export namespace PerformPatchTransfersCommand {
    export class Input {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly transferId: string,
            public readonly response: TransfersIDPatchResponse,
        ) {
        }
    }

    export class Output {
    }
}

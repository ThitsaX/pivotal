import {TransfersPostRequest} from '@shared/fspiop';

export class PerformPostTransfersCommand {
    constructor(public readonly input: PerformPostTransfersCommand.Input) {
    }
}

export namespace PerformPostTransfersCommand {
    export class Input {
        constructor(public readonly payerFsp: string,
                    public readonly payeeFsp: string,
                    public readonly request: TransfersPostRequest) {
        }
    }

    export class Output {
    }
}

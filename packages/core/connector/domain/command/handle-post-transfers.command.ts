import {TransfersPostRequest} from '@shared/fspiop';

export class HandlePostTransfersCommand {
    constructor(public readonly input: HandlePostTransfersCommand.Input) {
    }
}

export namespace HandlePostTransfersCommand {
    export class Input {
        constructor(public readonly payerFsp: string,
                    public readonly payeeFsp: string,
                    public readonly correlationId: string,
                    public readonly request: TransfersPostRequest) {
        }
    }

    export class Output {
    }
}

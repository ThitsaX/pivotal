import {TransfersPostRequest} from '@shared/fspiop';

export class HandlePostTransfersCommand {
    constructor(public readonly input: HandlePostTransfersCommand.Input) {
    }
}

export namespace HandlePostTransfersCommand {
    export class Input {
        constructor(public readonly body: TransfersPostRequest) {
        }
    }

    export class Output {
    }
}

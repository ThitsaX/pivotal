import {PartyIdType} from '@shared/fspiop';

export class HandleGetPartiesCommand {
    constructor(public readonly input: HandleGetPartiesCommand.Input) {
    }
}

export namespace HandleGetPartiesCommand {
    export class Input {
        constructor(public readonly type: PartyIdType, public readonly id: string,) {
        }
    }

    export class Output {
    }
}

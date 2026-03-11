import {PartyIdType} from '@shared/fspiop';

export class HandleGetPartiesCommand {
    constructor(public readonly input: HandleGetPartiesCommand.Input) {
    }
}

export namespace HandleGetPartiesCommand {
    export class Input {
        constructor(public readonly payerFsp: string,
                    public readonly payeeFsp: string,
                    public readonly partyIdType: PartyIdType,
                    public readonly partyId: string,
                    public readonly subId: string | null | undefined) {
        }
    }

    export class Output {
    }
}

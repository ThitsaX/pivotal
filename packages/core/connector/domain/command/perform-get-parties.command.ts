import {PartyIdType} from '@shared/fspiop';

export class PerformGetPartiesCommand {
    constructor(public readonly input: PerformGetPartiesCommand.Input) {
    }
}

export namespace PerformGetPartiesCommand {
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

import {PartiesTypeIDPutResponse, PartyIdType} from '@shared/fspiop';

export class DoLookupCommand {
    constructor(public readonly input: DoLookupCommand.Input) {
    }
}

export namespace DoLookupCommand {

    export class Input {
        constructor(public readonly type: PartyIdType, public readonly id: string, public readonly subId: string) {
        }
    }

    export class Output {
        constructor(public readonly response: PartiesTypeIDPutResponse) {
        }
    }
}

import {PartiesTypeIDPutResponse, PartyIdType} from '@shared/fspiop';

export class HandlePutPartiesCommand {
    constructor(public readonly input: HandlePutPartiesCommand.Input) {
    }
}

export namespace HandlePutPartiesCommand {
    export class Input {
        constructor(
            public readonly correlationId: string | null,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly partyIdType: PartyIdType,
            public readonly partyId: string,
            public readonly subId: string | null | undefined,
            public readonly response: PartiesTypeIDPutResponse | null,
        ) {
        }
    }

    export class Output {
    }
}

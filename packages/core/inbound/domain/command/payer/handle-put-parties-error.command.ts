import {ErrorInformationObject, PartyIdType} from '@shared/fspiop';

export class HandlePutPartiesErrorCommand {
    constructor(public readonly input: HandlePutPartiesErrorCommand.Input) {
    }
}

export namespace HandlePutPartiesErrorCommand {
    export class Input {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly partyIdType: PartyIdType,
            public readonly partyId: string,
            public readonly subId: string | null | undefined,
            public readonly error: ErrorInformationObject | null,
        ) {
        }
    }

    export class Output {
    }
}

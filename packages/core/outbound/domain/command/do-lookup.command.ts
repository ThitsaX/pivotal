import {PartiesTypeIDPutResponse, PartyIdType} from '@shared/fspiop';

export class DoLookupCommand {
    constructor(public readonly input: DoLookupCommand.Input) {
    }
}

export namespace DoLookupCommand {

    export class Input {
        constructor(
            public readonly correlationId: string,
            public readonly source: string,
            public readonly type: PartyIdType,
            public readonly id: string,
            public readonly subId?: string,
        ) {
        }
    }

    /**
     * Resolved once the PUT /parties callback arrives on the
     * parties:<correlationId> subject via PartiesResponseSubscriber.
     * Throws FspiopException if the error callback arrives instead, or on timeout.
     */
    export class Output {
        constructor(public readonly response: PartiesTypeIDPutResponse) {
        }
    }
}

import {PartyIdType} from '@shared/fspiop';

export class InitiateOutboundPartiesCommand {
    constructor(public readonly input: InitiateOutboundPartiesCommand.Input) {
    }
}

export namespace InitiateOutboundPartiesCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly rail: string,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: bigint,
            public readonly partyIdType: PartyIdType,
            public readonly partyId: string,
            public readonly subId?: string,
        ) {
        }
    }

    export class Output {
        constructor(public readonly id: string) {
        }
    }
}

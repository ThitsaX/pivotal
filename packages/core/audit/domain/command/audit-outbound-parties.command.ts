import {ErrorInformationObject, PartiesTypeIDPutResponse, PartyIdType} from '@shared/fspiop';

export class AuditOutboundPartiesCommand {
    constructor(public readonly input: AuditOutboundPartiesCommand.Input) {
    }
}

export namespace AuditOutboundPartiesCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly rail: string,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly partyIdType: PartyIdType,
            public readonly partyId: string,
            public readonly subId?: string,
            public readonly response: PartiesTypeIDPutResponse | null = null,
            public readonly error: ErrorInformationObject | null = null,
            public readonly createdAt?: Date,
            public readonly completedAt?: Date,
        ) {
        }
    }

    export class Output {
        constructor(public readonly id: string) {
        }
    }
}

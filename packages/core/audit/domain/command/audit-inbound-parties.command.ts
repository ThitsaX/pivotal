import {ErrorInformationObject, PartiesTypeIDPutResponse, PartyIdType} from '@shared/fspiop';
import {InboundStageEnum} from '../model/inbound-stage.enum';

export class AuditInboundPartiesCommand {
    constructor(public readonly input: AuditInboundPartiesCommand.Input) {
    }
}

export namespace AuditInboundPartiesCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly correlationId: string,
            public readonly rail: string,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly partyIdType: PartyIdType,
            public readonly partyId: string,
            public readonly subId: string | null | undefined,
            public readonly response: PartiesTypeIDPutResponse | null = null,
            public readonly error: ErrorInformationObject | null = null,
            public readonly fspError: string | null = null,
            public readonly createdAt?: Date,
            public readonly completedAt?: Date | null,
            public readonly stage: InboundStageEnum = InboundStageEnum.AT_CONNECTOR,
        ) {
        }
    }

    export class Output {
        constructor(public readonly id: string) {
        }
    }
}

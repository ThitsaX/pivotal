import { ErrorInformationObject, PartiesTypeIDPutResponse, PartyIdType } from '@shared/fspiop';

export class OutboundPartiesDto {

    public id: string;

    public rail: string;

    public payerFsp: string;

    public payeeFsp: string;

    public correlationId: bigint;

    public partyIdType: PartyIdType;

    public partyId: string;

    public subId: string | undefined | null;

    public response: PartiesTypeIDPutResponse | null;

    public error: ErrorInformationObject | null;

    public failed: boolean = false;

    public createdAt: Date;

    public completedAt: Date;
}

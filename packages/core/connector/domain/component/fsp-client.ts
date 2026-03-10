import {
    TransfersIDPatchResponse,
    PartiesTypeIDPutResponse,
    PartyIdType,
    QuotesIDPutResponse,
    QuotesPostRequest,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '@shared/fspiop';

export abstract class FspClient {
    abstract getParties(input: FspClient.GetPartiesInput): Promise<PartiesTypeIDPutResponse>;
    abstract postQuotes(body: QuotesPostRequest): Promise<QuotesIDPutResponse>;
    abstract postTransfers(body: TransfersPostRequest): Promise<TransfersIDPutResponse>;
    abstract patchTransfers(input: FspClient.PatchTransfersInput): Promise<void>;
}

export namespace FspClient {

    export class GetPartiesInput {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly partyIdType: PartyIdType,
            public readonly partyId: string,
            public readonly subId: string | null | undefined,
        ) {}
    }

    export class PatchTransfersInput {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly transferId: string,
            public readonly response: TransfersIDPatchResponse,
        ) {}
    }
}

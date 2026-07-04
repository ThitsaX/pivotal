// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {
    AmountType,
    ExtensionList,
    Money,
    Party,
    PartiesTypeIDPutResponse,
    PartyIdType,
    TransactionScenario,
    TransfersIDPatchResponse,
    TransfersIDPutResponse,
} from '@shared/fspiop';

export abstract class FspClient {
    abstract getParties(
        partyIdType: PartyIdType,
        partyId: string,
        subId?: string | null,
    ): Promise<PartiesTypeIDPutResponse>;

    abstract postQuotes(
        scenario: TransactionScenario,
        subScenario: string | undefined,
        amountType: AmountType,
        amount: Money,
        payerFspFee?: Money,
        extensionList?: ExtensionList,
    ): Promise<FspClient.PostQuotesOutput>;

    abstract postTransfers(
        transferId: string,
        transferAmount: Money,
        payee: Party,
    ): Promise<TransfersIDPutResponse>;

    abstract patchTransfers(input: FspClient.PatchTransfersInput): Promise<void>;
}

export namespace FspClient {

    export class PostQuotesOutput {
        constructor(
            public readonly transferAmount: Money,
            public readonly payeeReceiveAmount: Money,
            public readonly fees: ExtensionList,
        ) {
        }
    }

    export class PatchTransfersInput {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly transferId: string,
            public readonly response: TransfersIDPatchResponse,
        ) {
        }
    }
}

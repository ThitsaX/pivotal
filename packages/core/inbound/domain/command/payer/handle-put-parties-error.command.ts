// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ErrorInformationObject, PartyIdType} from '@shared/fspiop';

export class HandlePutPartiesErrorCommand {
    constructor(public readonly input: HandlePutPartiesErrorCommand.Input) {
    }
}

export namespace HandlePutPartiesErrorCommand {
    export class Input {
        constructor(
            public readonly correlationId: string | null,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
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

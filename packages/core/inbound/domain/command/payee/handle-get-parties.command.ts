// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {PartyIdType} from '@shared/fspiop';

export class HandleGetPartiesCommand {
    constructor(public readonly input: HandleGetPartiesCommand.Input) {
    }
}

export namespace HandleGetPartiesCommand {
    export class Input {
        constructor(public readonly correlationId: string | null,
                    public readonly payerFsp: string,
                    public readonly payeeFsp: string,
                    public readonly partyIdType: PartyIdType,
                    public readonly partyId: string,
                    public readonly subId: string | null | undefined) {
        }
    }

    export class Output {
    }
}

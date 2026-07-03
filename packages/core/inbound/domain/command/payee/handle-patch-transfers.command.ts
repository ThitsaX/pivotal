// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {TransfersIDPatchResponse} from '@shared/fspiop';

export class HandlePatchTransfersCommand {
    constructor(public readonly input: HandlePatchTransfersCommand.Input) {
    }
}

export namespace HandlePatchTransfersCommand {
    export class Input {
        constructor(
            public readonly correlationId: string | null,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly transferId: string,
            public readonly response: TransfersIDPatchResponse,
        ) {
        }
    }

    export class Output {
    }
}

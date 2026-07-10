// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ErrorInformationObject} from '@shared/fspiop';

export class HandlePutTransfersErrorCommand {
    constructor(public readonly input: HandlePutTransfersErrorCommand.Input) {
    }
}

export namespace HandlePutTransfersErrorCommand {
    export class Input {
        constructor(
            public readonly correlationId: string | null,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly transferId: string,
            public readonly error: ErrorInformationObject | null,
        ) {
        }
    }

    export class Output {
    }
}

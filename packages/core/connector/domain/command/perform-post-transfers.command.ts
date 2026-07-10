// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {TransfersPostRequest} from '@shared/fspiop';

export class PerformPostTransfersCommand {
    constructor(public readonly input: PerformPostTransfersCommand.Input) {
    }
}

export namespace PerformPostTransfersCommand {
    export class Input {
        constructor(public readonly correlationId: string | null,
                    public readonly payerFsp: string,
                    public readonly payeeFsp: string,
                    public readonly request: TransfersPostRequest) {
        }
    }

    export class Output {
    }
}

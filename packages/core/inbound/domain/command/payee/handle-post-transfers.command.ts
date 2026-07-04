// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {TransfersPostRequest} from '@shared/fspiop';

export class HandlePostTransfersCommand {
    constructor(public readonly input: HandlePostTransfersCommand.Input) {
    }
}

export namespace HandlePostTransfersCommand {
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

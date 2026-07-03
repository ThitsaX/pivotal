// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {QuotesPostRequest} from '@shared/fspiop';

export class PerformPostQuotesCommand {
    constructor(public readonly input: PerformPostQuotesCommand.Input) {
    }
}

export namespace PerformPostQuotesCommand {
    export class Input {
        constructor(public readonly correlationId: string | null,
                    public readonly payerFsp: string,
                    public readonly payeeFsp: string,
                    public readonly request: QuotesPostRequest) {
        }
    }

    export class Output {
    }
}

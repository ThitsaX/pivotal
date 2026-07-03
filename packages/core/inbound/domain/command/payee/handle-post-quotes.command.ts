// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {QuotesPostRequest} from '@shared/fspiop';

export class HandlePostQuotesCommand {
    constructor(public readonly input: HandlePostQuotesCommand.Input) {
    }
}

export namespace HandlePostQuotesCommand {
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

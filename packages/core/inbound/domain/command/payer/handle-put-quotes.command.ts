// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {QuotesIDPutResponse} from '@shared/fspiop';

export class HandlePutQuotesCommand {
    constructor(public readonly input: HandlePutQuotesCommand.Input) {
    }
}

export namespace HandlePutQuotesCommand {
    export class Input {
        constructor(
            public readonly correlationId: string | null,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly quoteId: string,
            public readonly response: QuotesIDPutResponse | null,
        ) {
        }
    }

    export class Output {
    }
}

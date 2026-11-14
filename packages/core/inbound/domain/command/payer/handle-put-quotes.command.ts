// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {QuotesIDPutResponse} from '@shared/fspiop';
import type {OriginalIso20022QuoteResponsePayload} from '@shared/iso20022';

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
            public readonly iso20022QuoteResponse?: OriginalIso20022QuoteResponsePayload,
        ) {
        }
    }

    export class Output {
    }
}

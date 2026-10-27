// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {QuotesPostRequest} from '@shared/fspiop';
import type {OriginalIso20022PostQuotePayload} from '@shared/iso20022';

export class PerformPostQuotesCommand {
    constructor(public readonly input: PerformPostQuotesCommand.Input) {
    }
}

export namespace PerformPostQuotesCommand {
    export class Input {
        constructor(public readonly correlationId: string | null,
                    public readonly payerFsp: string,
                    public readonly payeeFsp: string,
                    public readonly request: QuotesPostRequest,
                    public readonly iso20022PostQuoteRequest?: OriginalIso20022PostQuotePayload) {
        }
    }

    export class Output {
    }
}

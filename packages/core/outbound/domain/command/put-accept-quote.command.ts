// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {TransfersIDPutResponse} from '@shared/fspiop';
import {SendMoneyResponse} from '../dto';

export class PutAcceptQuoteCommand {
    constructor(public readonly input: PutAcceptQuoteCommand.Input) {
    }
}

export namespace PutAcceptQuoteCommand {

    export class Input {
        constructor(
            public readonly transferId: string,
            public readonly acceptQuote: boolean,
            public readonly requestSource?: string,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly response: SendMoneyResponse,
            public readonly callback: TransfersIDPutResponse,
        ) {
        }
    }
}

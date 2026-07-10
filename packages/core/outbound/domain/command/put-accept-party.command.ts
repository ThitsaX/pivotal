// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ExtensionList, QuotesIDPutResponse} from '@shared/fspiop';
import {SendMoneyResponse} from '../dto';

export class PutAcceptPartyCommand {
    constructor(public readonly input: PutAcceptPartyCommand.Input) {
    }
}

export namespace PutAcceptPartyCommand {

    export class Input {
        constructor(
            public readonly transferId: string,
            public readonly acceptParty: boolean,
            public readonly amount: string,
            public readonly extensionList?: ExtensionList,
            public readonly requestSource?: string,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly response: SendMoneyResponse,
            public readonly callback: QuotesIDPutResponse,
        ) {
        }
    }
}

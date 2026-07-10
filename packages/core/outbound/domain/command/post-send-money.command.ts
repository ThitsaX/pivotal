// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {PartiesTypeIDPutResponse} from '@shared/fspiop';
import {SendMoneyRequest, SendMoneyResponse} from '../dto';

export class PostSendMoneyCommand {
    constructor(public readonly input: PostSendMoneyCommand.Input) {
    }
}

export namespace PostSendMoneyCommand {

    export class Input {
        constructor(
            public readonly correlationId: string,
            public readonly source: string,
            public readonly request: SendMoneyRequest,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly response: SendMoneyResponse,
            public readonly callback: PartiesTypeIDPutResponse,
        ) {
        }
    }
}

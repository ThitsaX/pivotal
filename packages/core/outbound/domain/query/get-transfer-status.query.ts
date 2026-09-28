// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {TransferStatusResponse} from '../dto';
import {ErrorMessageLanguage, FspiopUserMessages} from '@shared/fspiop';

export class GetTransferStatusQuery {
    constructor(public readonly input: GetTransferStatusQuery.Input) {
    }
}

export namespace GetTransferStatusQuery {
    export class Input {
        constructor(
            public readonly transferId: string,
            public readonly requesterFspId: string,
            public readonly language: ErrorMessageLanguage = FspiopUserMessages.DEFAULT_LANGUAGE,
        ) {
        }
    }

    export class Output extends TransferStatusResponse {
    }
}

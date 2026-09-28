// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {FspiopVerifyMode} from '@shared/fspiop';

export class UpdateJwsPolicyCommand {
    constructor(public readonly input: UpdateJwsPolicyCommand.Input) {
    }
}

export namespace UpdateJwsPolicyCommand {

    export class Input {
        constructor(
            public readonly fspId: string,
            /** Undefined leaves the current value; the two switches move independently. */
            public readonly jwsSignEnabled: boolean | undefined,
            public readonly jwsVerifyMode: FspiopVerifyMode | undefined,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly fspId: string,
            public readonly jwsSignEnabled: boolean,
            public readonly jwsVerifyMode: FspiopVerifyMode,
        ) {
        }
    }
}

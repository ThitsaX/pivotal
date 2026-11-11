// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {FspiopVerifyMode} from '@shared/fspiop';

export class GetJwsPolicyQuery {
    constructor(public readonly input: GetJwsPolicyQuery.Input) {
    }
}

export namespace GetJwsPolicyQuery {

    export class Input {
        constructor(public readonly fspId: string) {
        }
    }

    export class Output {
        constructor(
            public readonly fspId: string,
            /** `self` for a tenant Pivotal signs for, `peer` for one it only verifies. */
            public readonly role: string,
            /** Whether a public key is on record. Signing cannot be enabled without one. */
            public readonly hasPublicKey: boolean,
            public readonly jwsSignEnabled: boolean,
            public readonly jwsVerifyMode: FspiopVerifyMode,
        ) {
        }
    }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class GetGovernmentPayerDisplayNameQuery {
    constructor(public readonly input: GetGovernmentPayerDisplayNameQuery.Input) {
    }
}

export namespace GetGovernmentPayerDisplayNameQuery {

    export class Input {
        constructor(public readonly fspId: string) {
        }
    }

    export class Output {
        constructor(
            public readonly fspId: string,
            public readonly displayName: string | null,
        ) {
        }
    }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class UpdateGovernmentPayerDisplayNameCommand {
    constructor(public readonly input: UpdateGovernmentPayerDisplayNameCommand.Input) {
    }
}

export namespace UpdateGovernmentPayerDisplayNameCommand {

    export class Input {
        constructor(
            public readonly fspId: string,
            /** Null, or blank after trimming, clears the stored name. */
            public readonly displayName: string | null,
        ) {
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

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class RevokeDfspCertificateCommand {
    constructor(public readonly input: RevokeDfspCertificateCommand.Input) {
    }
}

export namespace RevokeDfspCertificateCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly reason?: string,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly id: string,
            public readonly fspId: string,
            public readonly status: string,
            public readonly revokedAt: Date,
        ) {
        }
    }
}

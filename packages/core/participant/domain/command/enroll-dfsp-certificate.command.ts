// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class EnrollDfspCertificateCommand {
    constructor(public readonly input: EnrollDfspCertificateCommand.Input) {
    }
}

export namespace EnrollDfspCertificateCommand {

    export class Input {
        constructor(
            public readonly fspId: string,
            public readonly csrPem: string,
            public readonly note?: string,
        ) {
        }
    }

    /**
     * Carries the chain as well as the certificate: a DFSP installing only the leaf presents an
     * incomplete chain, and the peer then cannot build a path to the root.
     */
    export class Output {
        constructor(
            public readonly id: string,
            public readonly fspId: string,
            public readonly serial: string,
            public readonly fingerprintSha256: string,
            public readonly subject: string,
            public readonly validFrom: Date,
            public readonly validTo: Date,
            public readonly certPem: string,
            public readonly caChainPem: string | null,
        ) {
        }
    }
}

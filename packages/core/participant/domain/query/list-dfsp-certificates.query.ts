// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class ListDfspCertificatesQuery {
    constructor(public readonly input: ListDfspCertificatesQuery.Input) {
    }
}

export namespace ListDfspCertificatesQuery {

    export class Input {
        constructor(public readonly fspId: string) {
        }
    }

    /**
     * Metadata only. The certificate itself is public, but a list view has no use for several
     * kilobytes of PEM per row; the download endpoint serves it when someone actually needs it.
     */
    export class Item {
        constructor(
            public readonly id: string,
            public readonly fspId: string,
            public readonly serial: string,
            public readonly fingerprintSha256: string,
            public readonly subject: string,
            public readonly status: string,
            public readonly validFrom: Date,
            public readonly validTo: Date,
            public readonly issuedAt: Date,
            public readonly revokedAt: Date | null,
            public readonly note: string | null,
        ) {
        }
    }

    export class Output {
        constructor(public readonly certificates: Item[]) {
        }
    }
}

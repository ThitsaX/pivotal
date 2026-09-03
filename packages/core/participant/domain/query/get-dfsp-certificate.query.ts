// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class GetDfspCertificateQuery {
    constructor(public readonly input: GetDfspCertificateQuery.Input) {
    }
}

export namespace GetDfspCertificateQuery {

    export class Input {
        constructor(public readonly id: string) {
        }
    }

    export class Output {
        constructor(
            public readonly id: string,
            public readonly fspId: string,
            public readonly serial: string,
            public readonly status: string,
            public readonly certPem: string,
            public readonly caChainPem: string | null,
        ) {
        }
    }
}

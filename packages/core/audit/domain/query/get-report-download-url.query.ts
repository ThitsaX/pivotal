// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class GetReportDownloadUrlQuery {
    constructor(public readonly input: GetReportDownloadUrlQuery.Input) {
    }
}

export namespace GetReportDownloadUrlQuery {

    export class AccessScope {
        constructor(
            public readonly userId?: string,
            public readonly fspId?: string,
        ) {
        }
    }

    export class Input {
        constructor(
            public readonly requestId: string,
            public readonly downloadUrl: string,
            public readonly accessScope?: AccessScope,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly requestId: string,
            public readonly found: boolean,
            public readonly status: string | null,
            public readonly downloadUrl: string | null,
            public readonly fileKey: string | null,
            public readonly errorMessage: string | null,
        ) {
        }
    }
}

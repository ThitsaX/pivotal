// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class GetReportDownloadStatusQuery {
    constructor(public readonly input: GetReportDownloadStatusQuery.Input) {
    }
}

export namespace GetReportDownloadStatusQuery {

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
            public readonly accessScope?: AccessScope,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly requestId: string,
            public readonly found: boolean,
            public readonly status: string | null,
            public readonly errorMessage: string | null,
        ) {
        }
    }
}

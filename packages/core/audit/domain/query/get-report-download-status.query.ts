export class GetReportDownloadStatusQuery {
    constructor(public readonly input: GetReportDownloadStatusQuery.Input) {
    }
}

export namespace GetReportDownloadStatusQuery {

    export class AccessScope {
        constructor(public readonly fspId: string) {
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

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export class ReportFile {
    constructor(
        public readonly bytes: Buffer,
        public readonly extension: string,
        public readonly contentType: string,
    ) {
    }
}

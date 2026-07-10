// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class ReportDownloadSettings {

    static readonly DEFAULTS = new ReportDownloadSettings();
    static readonly MAX_DOWNLOAD_ROWS = 50_000;

    constructor(
        public readonly workerEnabled: boolean = false,
        public readonly pollIntervalMs: number = 5000,
        public readonly pageSize: number = 50000,
        public readonly maxRowsPerFile: number = ReportDownloadSettings.MAX_DOWNLOAD_ROWS,
        public readonly maxZipFiles: number = 1,
        public readonly maxConcurrent: number = 3,
        public readonly staleRunningTtlMs: number = 20 * 60 * 1000,
        public readonly s3Enabled: boolean = false,
        public readonly s3Bucket: string = '',
        public readonly s3Region: string = 'us-east-1',
        public readonly s3AccessKeyId: string = '',
        public readonly s3SecretAccessKey: string = '',
        public readonly s3Endpoint: string = '',
        public readonly s3ForcePathStyle: boolean = true,
        public readonly s3Prefix: string = 'reports/',
        public readonly s3PresignedUrlTtlSeconds: number = 900,
    ) {
    }
}

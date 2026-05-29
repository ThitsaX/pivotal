export class ReportDownloadSettings {

    static readonly DEFAULTS = new ReportDownloadSettings();

    constructor(
        public readonly workerEnabled: boolean = false,
        public readonly pollIntervalMs: number = 5000,
        public readonly pageSize: number = 50000,
        public readonly maxRowsPerFile: number = 500000,
        public readonly maxZipFiles: number = 20,
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

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject, Injectable} from '@nestjs/common';
import {GetObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {REPORT_DOWNLOAD_SETTINGS} from './tokens';
import {ReportDownloadSettings} from './report-download-settings';

@Injectable()
export class S3ReportStorage {

    private readonly client: S3Client | null;

    constructor(
        @Inject(REPORT_DOWNLOAD_SETTINGS)
        private readonly settings: ReportDownloadSettings,
    ) {
        this.client = this.settings.s3Enabled ? this.createClient() : null;
    }

    async upload(key: string, bytes: Buffer, contentType: string): Promise<string> {
        if (this.client == null) {
            throw new Error('Report S3 upload is disabled. Set REPORT_S3_ENABLED=true.');
        }

        if (this.settings.s3Bucket.trim().length === 0) {
            throw new Error('REPORT_S3_BUCKET is required when report S3 upload is enabled.');
        }

        await this.client.send(new PutObjectCommand({
            Bucket:        this.settings.s3Bucket,
            Key:           key,
            Body:          bytes,
            ContentType:   contentType,
            ContentLength: bytes.length,
        }));

        return key;
    }

    async presignedDownloadUrl(key: string): Promise<string> {
        if (this.client == null) {
            throw new Error('Report S3 download is disabled. Set REPORT_S3_ENABLED=true.');
        }

        return getSignedUrl(
            this.client,
            new GetObjectCommand({
                Bucket: this.settings.s3Bucket,
                Key:    key,
            }),
            {expiresIn: this.settings.s3PresignedUrlTtlSeconds},
        );
    }

    async download(key: string): Promise<{bytes: Buffer; contentType: string}> {
        if (this.client == null) {
            throw new Error('Report S3 download is disabled. Set REPORT_S3_ENABLED=true.');
        }

        const output = await this.client.send(new GetObjectCommand({
            Bucket: this.settings.s3Bucket,
            Key:    key,
        }));

        if (output.Body == null) {
            throw new Error(`Report object ${key} has no body.`);
        }

        const body = output.Body as {transformToByteArray?: () => Promise<Uint8Array>};

        if (body.transformToByteArray == null) {
            throw new Error('Report object body cannot be read by this runtime.');
        }

        return {
            bytes: Buffer.from(await body.transformToByteArray()),
            contentType: output.ContentType ?? 'application/octet-stream',
        };
    }

    buildObjectKey(reportType: string, requestId: string, extension: string): string {
        const prefix = this.normalizePrefix(this.settings.s3Prefix);
        const timestamp = this.fileDate(new Date());
        const normalizedType = reportType.toLowerCase();

        return `${prefix}${normalizedType}/TransactionReport-${requestId}-${timestamp}.${extension}`;
    }

    private createClient(): S3Client {
        const options: ConstructorParameters<typeof S3Client>[0] = {
            region:         this.settings.s3Region,
            forcePathStyle: this.settings.s3ForcePathStyle,
        };

        if (this.settings.s3Endpoint.trim().length > 0) {
            options.endpoint = this.settings.s3Endpoint;
        }

        if (
            this.settings.s3AccessKeyId.trim().length > 0 &&
            this.settings.s3SecretAccessKey.trim().length > 0
        ) {
            options.credentials = {
                accessKeyId:     this.settings.s3AccessKeyId,
                secretAccessKey: this.settings.s3SecretAccessKey,
            };
        }

        return new S3Client(options);
    }

    private normalizePrefix(prefix: string): string {
        const normalized = prefix.trim();

        if (normalized.length === 0) {
            return '';
        }

        return normalized.endsWith('/') ? normalized : `${normalized}/`;
    }

    private fileDate(date: Date): string {
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = date.toLocaleString('en-US', {month: 'short', timeZone: 'UTC'});
        const year = date.getUTCFullYear();

        return `${day}${month}${year}`;
    }
}

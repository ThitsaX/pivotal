// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ConfigService} from '@nestjs/config';
import {AuditDomainModule, ReportDownloadSettings} from '@core/audit/domain';
import {TypeOrmSettings} from '@shared/typeorm';

export class ReportWorkerSettings implements AuditDomainModule.RequiredSettings {

    constructor(private readonly configService: ConfigService = new ConfigService()) {}

    writeTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readRequiredValue('DB_WRITE_HOST'),
            this.readPort('DB_WRITE_PORT'),
            this.readRequiredValue('DB_WRITE_USERNAME'),
            this.readRequiredValue('DB_WRITE_PASSWORD'),
            this.readRequiredValue('DB_WRITE_NAME'),
        );
    }

    readTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readRequiredValue('DB_READ_HOST'),
            this.readPort('DB_READ_PORT'),
            this.readRequiredValue('DB_READ_USERNAME'),
            this.readRequiredValue('DB_READ_PASSWORD'),
            this.readRequiredValue('DB_READ_NAME'),
        );
    }

    reportDownloadSettings(): ReportDownloadSettings {
        return new ReportDownloadSettings(
            this.readOptionalBoolean('REPORT_DOWNLOAD_WORKER_ENABLED') ?? true,
            this.readOptionalPositiveInteger('REPORT_DOWNLOAD_POLL_INTERVAL_MS') ?? 5000,
            this.readOptionalPositiveInteger('REPORT_DOWNLOAD_PAGE_SIZE') ?? 50000,
            this.readOptionalPositiveInteger('REPORT_DOWNLOAD_MAX_ROWS_PER_FILE') ?? ReportDownloadSettings.MAX_DOWNLOAD_ROWS,
            this.readOptionalPositiveInteger('REPORT_DOWNLOAD_MAX_ZIP_FILES') ?? 1,
            this.readOptionalPositiveInteger('REPORT_DOWNLOAD_MAX_CONCURRENT') ?? 3,
            this.readOptionalPositiveInteger('REPORT_DOWNLOAD_STALE_RUNNING_TTL_MS') ?? 20 * 60 * 1000,
            this.readOptionalBoolean('REPORT_S3_ENABLED') ?? false,
            this.readOptionalValue('REPORT_S3_BUCKET') ?? '',
            this.readOptionalValue('REPORT_S3_REGION') ?? 'us-east-1',
            this.readOptionalValue('REPORT_S3_ACCESS_KEY_ID') ?? '',
            this.readOptionalValue('REPORT_S3_SECRET_ACCESS_KEY') ?? '',
            this.readOptionalValue('REPORT_S3_ENDPOINT') ?? '',
            this.readOptionalBoolean('REPORT_S3_FORCE_PATH_STYLE') ?? false,
            this.readOptionalValue('REPORT_S3_PREFIX') ?? 'reports/',
            this.readOptionalPositiveInteger('REPORT_S3_PRESIGNED_URL_TTL_SECONDS') ?? 900,
        );
    }

    private readRequiredValue(name: string): string {
        const value = this.configService.get<string>(name);

        if (value == null || value.trim().length === 0) {
            throw new Error(`Missing required environment variable: ${name}`);
        }

        return value;
    }

    private readOptionalValue(name: string): string | undefined {
        const value = this.configService.get<string>(name);

        if (value == null || value.trim().length === 0) {
            return undefined;
        }

        return value;
    }

    private readPort(name: string): number {
        const value = this.readRequiredValue(name);
        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new Error(`Invalid environment variable ${name}: expected a positive integer.`);
        }

        return parsed;
    }

    private readPositiveInteger(name: string): number | undefined {
        const value = this.configService.get<string>(name);

        if (value == null) {
            return undefined;
        }

        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed <= 0) {
            return undefined;
        }

        return parsed;
    }

    private readOptionalPositiveInteger(name: string): number | undefined {
        return this.readPositiveInteger(name);
    }

    private readOptionalBoolean(name: string): boolean | undefined {
        const value = this.readOptionalValue(name);

        if (value == null) {
            return undefined;
        }

        const normalized = value.toLowerCase();

        if (['true', '1', 'yes'].includes(normalized)) {
            return true;
        }

        if (['false', '0', 'no'].includes(normalized)) {
            return false;
        }

        throw new Error(`Invalid environment variable ${name}: expected true/false.`);
    }
}

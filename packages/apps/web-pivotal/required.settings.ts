// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ConfigService} from '@nestjs/config';
import {ReportDownloadSettings} from '@core/audit/domain';
import {CentralLedgerAxiosParams} from '@shared/central-ledger';
import {TypeOrmSettings} from '@shared/typeorm';
import type {WebPivotalModule} from './web-pivotal.module';

export class WebPivotalSettings implements WebPivotalModule.RequiredSettings {

    private static readonly DEFAULT_ACCESS_TOKEN_TTL_SECONDS    = 900;       // 15 minutes

    private static readonly DEFAULT_REFRESH_TOKEN_TTL_DAYS      = 14;

    private static readonly DEFAULT_BCRYPT_COST_FACTOR          = 12;

    private static readonly DEFAULT_LOGIN_LOCKOUT_THRESHOLD     = 5;

    private static readonly DEFAULT_LOGIN_LOCKOUT_MINUTES       = 15;

    private static readonly DEFAULT_JWT_ISSUER                  = 'pivotal';

    private static readonly DEFAULT_AUDIT_MAX_LIMIT            = 50_000;

    constructor(private readonly configService: ConfigService = new ConfigService()) {
    }

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

    centralLedgerUrl(): string {
        return this.readRequiredValue('CENTRAL_LEDGER_URL');
    }

    /** Redis URL for reading the near-real-time dashboard counters (written by app-auditor). */
    redisUrl(): string {
        return this.readRequiredValue('REDIS_URL');
    }

    centralLedgerAxiosParams(): CentralLedgerAxiosParams {
        const socketTimeoutMs = this.readPositiveInteger('CENTRAL_LEDGER_SOCKET_TIMEOUT_MS');
        const connectionTimeoutMs = this.readPositiveInteger('CENTRAL_LEDGER_CONNECTION_TIMEOUT_MS');

        return {
            socketTimeoutMs,
            connectionTimeoutMs,
        };
    }

    jwtSecret(): string {
        return this.readRequiredValue('PIVOTAL_IAM_JWT_SECRET');
    }

    jwtIssuer(): string {
        return this.readOptionalValue('PIVOTAL_IAM_JWT_ISSUER') ?? WebPivotalSettings.DEFAULT_JWT_ISSUER;
    }

    accessTokenTtlSeconds(): number {
        return this.readOptionalPositiveInteger('PIVOTAL_IAM_ACCESS_TOKEN_TTL_SECONDS')
            ?? WebPivotalSettings.DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
    }

    refreshTokenTtlDays(): number {
        return this.readOptionalPositiveInteger('PIVOTAL_IAM_REFRESH_TOKEN_TTL_DAYS')
            ?? WebPivotalSettings.DEFAULT_REFRESH_TOKEN_TTL_DAYS;
    }

    bcryptCostFactor(): number {
        return this.readOptionalPositiveInteger('PIVOTAL_IAM_BCRYPT_COST_FACTOR')
            ?? WebPivotalSettings.DEFAULT_BCRYPT_COST_FACTOR;
    }

    loginLockoutThreshold(): number {
        return this.readOptionalPositiveInteger('PIVOTAL_IAM_LOGIN_LOCKOUT_THRESHOLD')
            ?? WebPivotalSettings.DEFAULT_LOGIN_LOCKOUT_THRESHOLD;
    }

    loginLockoutDurationMinutes(): number {
        return this.readOptionalPositiveInteger('PIVOTAL_IAM_LOGIN_LOCKOUT_MINUTES')
            ?? WebPivotalSettings.DEFAULT_LOGIN_LOCKOUT_MINUTES;
    }

    adminSeedEmail(): string {
        return this.readRequiredValue('PIVOTAL_IAM_ADMIN_SEED_EMAIL');
    }

    adminSeedTempPassword(): string {
        return this.readRequiredValue('PIVOTAL_IAM_ADMIN_SEED_TEMP_PASSWORD');
    }

    corsAllowedOrigins(): string[] {
        const raw = this.readOptionalValue('PIVOTAL_IAM_CORS_ALLOWED_ORIGINS');

        if (raw == null) {
            return [];
        }

        return raw.split(',').map((origin) => origin.trim()).filter((origin) => origin.length > 0);
    }

    /**
     * `AUDIT_MAX_RESULT_ROWS` — cap on the rows the Find Transactions query scans, counts,
     * and returns. Defaults to 50,000 and cannot be raised above that value via env.
     */
    auditMaxLimit(): number {
        return Math.min(
            this.readPositiveInteger('AUDIT_MAX_RESULT_ROWS') ?? WebPivotalSettings.DEFAULT_AUDIT_MAX_LIMIT,
            WebPivotalSettings.DEFAULT_AUDIT_MAX_LIMIT,
        );
    }

    reportDownloadSettings(): ReportDownloadSettings {
        return new ReportDownloadSettings(
            this.readOptionalBoolean('REPORT_DOWNLOAD_WORKER_ENABLED') ?? false,
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

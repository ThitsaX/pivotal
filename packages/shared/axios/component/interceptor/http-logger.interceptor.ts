// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import { Logger } from '@nestjs/common';
import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

interface AxiosRequestConfigWithMetadata extends InternalAxiosRequestConfig {
    metadata?: {
        startedAt: number;
    };
}

export class HttpLoggerInterceptor {

    private readonly logger: Logger;
    private static readonly LOG_REDACTED_FIELDS = new Set([
        'logoBase64',
    ]);


    constructor(context = HttpLoggerInterceptor.name) {
        this.logger = new Logger(context);
    }

    requestInterceptor(): (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig {
        return (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
            const requestConfig = config as AxiosRequestConfigWithMetadata;
            requestConfig.metadata = {
                startedAt: Date.now(),
            };

            this.logger.log(
                `[REQ] ${HttpLoggerInterceptor.resolveMethod(requestConfig)} `
                + `${HttpLoggerInterceptor.resolveUrl(requestConfig)} `
                + `headers=${HttpLoggerInterceptor.stringify(requestConfig.headers)} `
                + `body=${HttpLoggerInterceptor.stringify(requestConfig.data)}`,
            );

            return requestConfig;
        };
    }

    responseInterceptor(): (response: AxiosResponse) => AxiosResponse {
        return (response: AxiosResponse): AxiosResponse => {
            const requestConfig = response.config as AxiosRequestConfigWithMetadata;
            const durationMs = HttpLoggerInterceptor.resolveDurationMs(requestConfig);

            this.logger.log(
                `[RES] ${response.status} ${HttpLoggerInterceptor.resolveMethod(requestConfig)} `
                + `${HttpLoggerInterceptor.resolveUrl(requestConfig)} `
                + `durationMs=${durationMs} `
                + `body=${HttpLoggerInterceptor.stringify(response.data)}`,
            );

            return response;
        };
    }

    responseErrorInterceptor(): (error: AxiosError | unknown) => never {
        return (error: AxiosError | unknown): never => {
            const axiosError = error as AxiosError;
            const requestConfig = axiosError?.config as AxiosRequestConfigWithMetadata | undefined;
            const durationMs = HttpLoggerInterceptor.resolveDurationMs(requestConfig);
            const status = axiosError?.response?.status ?? 'NO_STATUS';

            this.logger.error(
                `[ERR] ${status} ${HttpLoggerInterceptor.resolveMethod(requestConfig)} `
                + `${HttpLoggerInterceptor.resolveUrl(requestConfig)} `
                + `durationMs=${durationMs} `
                + `body=${HttpLoggerInterceptor.stringify(axiosError?.response?.data)}`,
            );

            throw error;
        };
    }

    private static resolveMethod(config?: InternalAxiosRequestConfig): string {
        return String(config?.method ?? 'UNKNOWN').toUpperCase();
    }

    private static resolveUrl(config?: InternalAxiosRequestConfig): string {
        return `${config?.baseURL ?? ''}${config?.url ?? ''}`;
    }

    private static resolveDurationMs(config?: AxiosRequestConfigWithMetadata): number {
        if (config?.metadata?.startedAt == null) {
            return -1;
        }

        return Date.now() - config.metadata.startedAt;
    }

    private static stringify(value: unknown): string {
        if (value == null) {
            return '';
        }

        if (typeof value === 'string') {
            return value;
        }

        try {
            return JSON.stringify(value, HttpLoggerInterceptor.redactLogValue);
        } catch {
            return String(value);
        }
    }

    private static redactLogValue(key: string, value: unknown): unknown {
        if (HttpLoggerInterceptor.LOG_REDACTED_FIELDS.has(key)) {
            if (typeof value === 'string') {
                return `[redacted base64 length=${value.length}]`;
            }

            return '[redacted]';
        }

        return value;
    }
}

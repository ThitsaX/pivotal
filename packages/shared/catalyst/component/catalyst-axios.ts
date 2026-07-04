// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {AxiosError, AxiosInstance, InternalAxiosRequestConfig} from 'axios';
import {AxiosClientBuilder} from '@shared/axios/component';
import {CatalystException} from '../exception';
import {
    CalculateFeeByFeePolicyIdInput,
    CalculateFeeByFeePolicyIdOutput,
    CalculateFeeInput,
    CalculateFeeOutput,
    FeePolicy,
} from '../dto';

export type CatalystHeadersMap = Record<string, string>;

export interface CatalystAxiosParams {
    /** Timeout (ms) waiting for response data after the connection is established. */
    socketTimeoutMs?: number;
    /** Timeout (ms) to establish the TCP connection. */
    connectionTimeoutMs?: number;
}

export type CatalystAxiosInterceptor = (
    config: InternalAxiosRequestConfig,
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;

export class CatalystErrorResponse {
    code: string;
    message: string;
}

export class CatalystAxiosError extends Error {
    constructor(
        public readonly status: number,
        public readonly responseData: CatalystErrorResponse,
    ) {
        super(`Catalyst error [${status}]`);
        this.name = 'CatalystAxiosError';
    }

    static is(error: unknown): error is CatalystAxiosError {
        return error instanceof CatalystAxiosError;
    }
}

export class CatalystAxios {

    private static readonly DEFAULT_SOCKET_TIMEOUT_MS = 10_000;
    private static readonly DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

    readonly catalystUrl: string;

    private readonly client: AxiosInstance;
    private readonly params: CatalystAxiosParams;
    private readonly interceptors: CatalystAxiosInterceptor[];
    private readonly defaultHeaders: CatalystHeadersMap;

    constructor(
        catalystUrl: string,
        params: CatalystAxiosParams = {},
        interceptors: CatalystAxiosInterceptor[] = [],
        headers: CatalystHeadersMap = {},
        client?: AxiosInstance,
    ) {
        const resolvedParams: CatalystAxiosParams = {
            socketTimeoutMs: params.socketTimeoutMs ?? CatalystAxios.DEFAULT_SOCKET_TIMEOUT_MS,
            connectionTimeoutMs: params.connectionTimeoutMs ?? CatalystAxios.DEFAULT_CONNECTION_TIMEOUT_MS,
        };

        this.catalystUrl = catalystUrl;
        this.params = resolvedParams;
        this.interceptors = interceptors;
        this.defaultHeaders = headers;
        this.client = client ?? CatalystAxios.buildClient(resolvedParams, interceptors);
    }

    private static buildClient(
        params: CatalystAxiosParams,
        interceptors: CatalystAxiosInterceptor[],
    ): AxiosInstance {

        const builder = AxiosClientBuilder.newBuilder()
            .withParams(params);

        for (const interceptor of interceptors) {
            builder.withRequestInterceptor(interceptor);
        }

        builder.withResponseInterceptor(
            (response) => response,
            (error: AxiosError) => {
                throw CatalystAxios.toCatalystException(error);
            },
        );

        return builder.build();
    }

    private static toCatalystException(error: AxiosError): CatalystException {
        const status = error.response?.status ?? 503;
        const data = error.response?.data;

        const code = error.response != null
            ? CatalystAxios.resolveResponseCode(status, data)
            : 'CATALYST_COMMUNICATION_ERROR';
        const message = CatalystAxios.resolveErrorMessage(status, data, error);

        return new CatalystException(code, `Catalyst (${code}) ${message}`);
    }

    private static resolveResponseCode(status: number, data: unknown): string {
        const bodyCode = CatalystAxios.readStringField(data, 'code');

        if (bodyCode != null && bodyCode.trim().length > 0) {
            return bodyCode.trim();
        }

        return `CATALYST_HTTP_${status}`;
    }

    private static resolveErrorMessage(status: number, data: unknown, error: AxiosError): string {
        const responseMessage = CatalystAxios.resolveResponseMessage(data);
        const transportMessage = CatalystAxios.resolveTransportMessage(error);

        const message = CatalystAxios.firstNonBlank(
            responseMessage,
            transportMessage,
            `Catalyst request failed with HTTP ${status}.`,
        );

        return message ?? `Catalyst request failed with HTTP ${status}.`;
    }

    private static resolveResponseMessage(data: unknown): string | undefined {
        if (typeof data === 'string') {
            return data;
        }

        const message = CatalystAxios.readStringField(data, 'message');
        if (message != null && message.trim().length > 0) {
            return message;
        }

        const detail = CatalystAxios.readStringField(data, 'detail');
        if (detail != null && detail.trim().length > 0) {
            return detail;
        }

        const error = CatalystAxios.readStringField(data, 'error');
        if (error != null && error.trim().length > 0) {
            return error;
        }

        const nestedError = CatalystAxios.readNestedStringField(data, 'error', 'message');
        if (nestedError != null && nestedError.trim().length > 0) {
            return nestedError;
        }

        return undefined;
    }

    private static resolveTransportMessage(error: AxiosError): string | undefined {
        const candidates: string[] = [
            error.message,
        ];

        if (error.cause instanceof Error) {
            candidates.push(error.cause.message);
        }

        const aggregateCause = error.cause as {errors?: unknown[]} | undefined;
        if (Array.isArray(aggregateCause?.errors)) {
            for (const item of aggregateCause.errors) {
                if (item instanceof Error) {
                    candidates.push(item.message);
                }
            }
        }

        return CatalystAxios.firstNonBlank(...candidates);
    }

    private static readStringField(data: unknown, fieldName: string): string | undefined {
        if (data == null || typeof data !== 'object') {
            return undefined;
        }

        const value = (data as Record<string, unknown>)[fieldName];
        return typeof value === 'string' ? value : undefined;
    }

    private static readNestedStringField(data: unknown, parentFieldName: string, childFieldName: string): string | undefined {
        if (data == null || typeof data !== 'object') {
            return undefined;
        }

        const parent = (data as Record<string, unknown>)[parentFieldName];
        if (parent == null || typeof parent !== 'object') {
            return undefined;
        }

        const value = (parent as Record<string, unknown>)[childFieldName];
        return typeof value === 'string' ? value : undefined;
    }

    private static firstNonBlank(...values: Array<string | undefined>): string | undefined {
        for (const value of values) {
            if (value != null && value.trim().length > 0) {
                return value;
            }
        }

        return undefined;
    }

    withHeaders(headers: CatalystHeadersMap): CatalystAxios {
        return new CatalystAxios(this.catalystUrl, this.params, this.interceptors, headers, this.client);
    }

    async findFeePolicy(
        scenarioName: string,
        currency: string,
    ): Promise<FeePolicy> {
        return this.get(
            '/fee-policies/find',
            {
                scenarioName,
                currency,
            },
        );
    }

    async getFeePolicy(id: string): Promise<FeePolicy> {
        return this.get(`/fee-policies/${id}`);
    }

    async calculateFee(
        body: CalculateFeeInput,
    ): Promise<CalculateFeeOutput> {
        return this.post(
            '/fees/calculate',
            body,
        );
    }

    async calculateFeeWithPolicyId(
        body: CalculateFeeByFeePolicyIdInput,
    ): Promise<CalculateFeeByFeePolicyIdOutput> {
        return this.post(
            '/fees/calculate-with-policy',
            body,
        );
    }

    private async get<ResponseType>(
        path: string,
        query?: Record<string, string | number | boolean | undefined>,
    ): Promise<ResponseType> {
        const response = await this.client.get<ResponseType>(
            this.resolveUrl(path),
            {
                headers: this.defaultHeaders,
                params: query,
            },
        );

        return response.data;
    }

    private async post<ResponseType, RequestType = unknown>(
        path: string,
        body: RequestType,
    ): Promise<ResponseType> {
        const response = await this.client.post<ResponseType>(
            this.resolveUrl(path),
            body,
            {
                headers: this.defaultHeaders,
            },
        );

        return response.data;
    }

    private resolveUrl(path: string): string {
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
        }

        if (path.startsWith('/')) {
            return `${this.catalystUrl}${path}`;
        }

        return `${this.catalystUrl}/${path}`;
    }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {AxiosError, AxiosInstance, InternalAxiosRequestConfig} from 'axios';
import {AxiosClientBuilder} from '@shared/axios/component';
import {CatalystException} from '../exception';
import {
    AddPolicyScheduleInput,
    AddPolicyScheduleOutput,
    CreateFeePolicyInput,
    CreateFeePolicyOutput,
    CreateScenarioInput,
    CreateScenarioOutput,
    FeePolicy,
    FeePolicySummary,
    FeePolicyTemplate,
    PolicySchedule,
    RemovePolicyScheduleInput,
    RemovePolicyScheduleOutput,
    Scenario,
    ScenarioIdInput,
    ScenarioSummary,
    TemplatizeFeePolicyInput,
} from '../dto';

export type CatalystAdminHeadersMap = Record<string, string>;

export interface CatalystAdminAxiosParams {
    /** Timeout (ms) waiting for response data after the connection is established. */
    socketTimeoutMs?: number;
    /** Timeout (ms) to establish the TCP connection. */
    connectionTimeoutMs?: number;
}

export type CatalystAdminAxiosInterceptor = (
    config: InternalAxiosRequestConfig,
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;

export class CatalystAdminErrorResponse {
    code: string;
    message: string;
}

export class CatalystAdminAxiosError extends Error {
    constructor(
        public readonly status: number,
        public readonly responseData: CatalystAdminErrorResponse,
    ) {
        super(`Catalyst admin error [${status}]`);
        this.name = 'CatalystAdminAxiosError';
    }

    static is(error: unknown): error is CatalystAdminAxiosError {
        return error instanceof CatalystAdminAxiosError;
    }
}

export class CatalystAdminAxios {

    private static readonly DEFAULT_SOCKET_TIMEOUT_MS = 10_000;
    private static readonly DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

    readonly catalystUrl: string;

    private readonly client: AxiosInstance;
    private readonly params: CatalystAdminAxiosParams;
    private readonly interceptors: CatalystAdminAxiosInterceptor[];
    private readonly defaultHeaders: CatalystAdminHeadersMap;

    constructor(
        catalystUrl: string,
        params: CatalystAdminAxiosParams = {},
        interceptors: CatalystAdminAxiosInterceptor[] = [],
        headers: CatalystAdminHeadersMap = {},
        client?: AxiosInstance,
    ) {
        const resolvedParams: CatalystAdminAxiosParams = {
            socketTimeoutMs: params.socketTimeoutMs ?? CatalystAdminAxios.DEFAULT_SOCKET_TIMEOUT_MS,
            connectionTimeoutMs: params.connectionTimeoutMs ?? CatalystAdminAxios.DEFAULT_CONNECTION_TIMEOUT_MS,
        };

        this.catalystUrl = catalystUrl;
        this.params = resolvedParams;
        this.interceptors = interceptors;
        this.defaultHeaders = headers;
        this.client = client ?? CatalystAdminAxios.buildClient(resolvedParams, interceptors);
    }

    private static buildClient(
        params: CatalystAdminAxiosParams,
        interceptors: CatalystAdminAxiosInterceptor[],
    ): AxiosInstance {

        const builder = AxiosClientBuilder.newBuilder()
            .withParams(params);

        for (const interceptor of interceptors) {
            builder.withRequestInterceptor(interceptor);
        }

        builder.withResponseInterceptor(
            (response) => response,
            (error: AxiosError) => {
                throw CatalystAdminAxios.toCatalystException(error);
            },
        );

        return builder.build();
    }

    private static toCatalystException(error: AxiosError): CatalystException {
        const status = error.response?.status ?? 503;
        const data = error.response?.data;

        const code = error.response != null
            ? CatalystAdminAxios.resolveResponseCode(status, data)
            : 'CATALYST_COMMUNICATION_ERROR';
        const message = CatalystAdminAxios.resolveErrorMessage(status, data, error);

        return new CatalystException(code, `Catalyst (${code}) ${message}`);
    }

    private static resolveResponseCode(status: number, data: unknown): string {
        const bodyCode = CatalystAdminAxios.readStringField(data, 'code');

        if (bodyCode != null && bodyCode.trim().length > 0) {
            return bodyCode.trim();
        }

        return `CATALYST_HTTP_${status}`;
    }

    private static resolveErrorMessage(status: number, data: unknown, error: AxiosError): string {
        const responseMessage = CatalystAdminAxios.resolveResponseMessage(data);
        const transportMessage = CatalystAdminAxios.resolveTransportMessage(error);

        const message = CatalystAdminAxios.firstNonBlank(
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

        const message = CatalystAdminAxios.readStringField(data, 'message');
        if (message != null && message.trim().length > 0) {
            return message;
        }

        const detail = CatalystAdminAxios.readStringField(data, 'detail');
        if (detail != null && detail.trim().length > 0) {
            return detail;
        }

        const error = CatalystAdminAxios.readStringField(data, 'error');
        if (error != null && error.trim().length > 0) {
            return error;
        }

        const nestedError = CatalystAdminAxios.readNestedStringField(data, 'error', 'message');
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

        return CatalystAdminAxios.firstNonBlank(...candidates);
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

    private static encodePathSegment(value: string | number): string {
        return encodeURIComponent(String(value));
    }

    withHeaders(headers: CatalystAdminHeadersMap): CatalystAdminAxios {
        return new CatalystAdminAxios(this.catalystUrl, this.params, this.interceptors, headers, this.client);
    }

    async createFeePolicy(body: CreateFeePolicyInput): Promise<CreateFeePolicyOutput> {
        return this.post(
            '/fee-policies/create',
            body,
        );
    }

    async templatizeFeePolicy(body: TemplatizeFeePolicyInput): Promise<FeePolicyTemplate> {
        return this.post(
            '/fee-policies/templatize',
            body,
        );
    }

    async getFeePolicy(id: string | number): Promise<FeePolicy> {
        return this.get(`/fee-policies/${CatalystAdminAxios.encodePathSegment(id)}`);
    }

    async getFeePolicies(): Promise<Array<FeePolicySummary>> {
        return this.get('/fee-policies');
    }

    async addPolicySchedule(body: AddPolicyScheduleInput): Promise<AddPolicyScheduleOutput> {
        return this.post(
            '/scenarios/add-schedule',
            body,
        );
    }

    async createScenario(body: CreateScenarioInput): Promise<CreateScenarioOutput> {
        return this.post(
            '/scenarios/create',
            body,
        );
    }

    async disableScenario(body: ScenarioIdInput): Promise<void> {
        await this.post(
            '/scenarios/disable',
            body,
        );
    }

    async enableScenario(body: ScenarioIdInput): Promise<void> {
        await this.post(
            '/scenarios/enable',
            body,
        );
    }

    async getPolicySchedules(scenarioId: string | number): Promise<Array<PolicySchedule>> {
        return this.get(
            '/scenarios/get-schedules',
            {
                scenarioId,
            },
        );
    }

    async removePolicySchedule(body: RemovePolicyScheduleInput): Promise<RemovePolicyScheduleOutput> {
        return this.post(
            '/scenarios/remove-schedule',
            body,
        );
    }

    async getScenario(id: string | number): Promise<Scenario> {
        return this.get(`/scenarios/${CatalystAdminAxios.encodePathSegment(id)}`);
    }

    async getScenarios(active?: boolean): Promise<Array<ScenarioSummary>> {
        return this.get(
            '/scenarios',
            {
                active,
            },
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

import {AxiosError, AxiosInstance, InternalAxiosRequestConfig} from 'axios';
import {AxiosClientBuilder} from '@shared/axios/component';
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
        this.catalystUrl = catalystUrl;
        this.params = params;
        this.interceptors = interceptors;
        this.defaultHeaders = headers;
        this.client = client ?? CatalystAxios.buildClient(params, interceptors);
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
                if (error.response) {
                    throw new CatalystAxiosError(
                        error.response.status,
                        error.response.data as CatalystErrorResponse,
                    );
                }

                throw error;
            },
        );

        return builder.build();
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

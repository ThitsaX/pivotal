import * as http from 'http';
import * as https from 'https';
import axios, {AxiosError, AxiosInstance, InternalAxiosRequestConfig} from 'axios';
import {FspiopHeadersMap} from '../fspiop-headers';
import {FspiopSettings} from '../fspiop-settings';
import {
    ErrorInformationResponse,
    FxQuotesIDPutResponse,
    FxQuotesPostRequest,
    FxTransfersIDPatchResponse,
    FxTransfersIDPutResponse,
    FxTransfersPostRequest,
    PartiesTypeIDPutResponse,
    PartyIdType,
    QuotesIDPutResponse,
    QuotesPostRequest,
    TransfersIDPatchResponse,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '../../dto';

export interface FspiopAxiosParams {
    /** Timeout (ms) waiting for response data after the connection is established. */
    socketTimeoutMs?: number;
    /** Timeout (ms) to establish the TCP connection. */
    connectionTimeoutMs?: number;
}

/**
 * Retrofit-style request interceptor.
 * Receives the outgoing Axios request config and must return it (optionally modified).
 * Use this to inject dynamic values such as auth tokens or signatures.
 *
 * @example — inject a bearer token
 * const interceptor: FspiopAxiosInterceptor = async (config) => {
 *   config.headers['Authorization'] = `Bearer ${await tokenService.getToken()}`;
 *   return config;
 * };
 */
export type FspiopAxiosInterceptor = (
    config: InternalAxiosRequestConfig,
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;

export class FspiopAxiosError extends Error {
    constructor(
        public readonly status: number,
        public readonly errorInformationResponse: ErrorInformationResponse,
    ) {
        const desc = errorInformationResponse.errorInformation?.errorDescription ?? 'unknown';
        const code = errorInformationResponse.errorInformation?.errorCode ?? '0000';
        super(`FSPIOP error [${status}] ${code}: ${desc}`);
        this.name = 'FspiopAxiosError';
    }

    static is(error: unknown): error is FspiopAxiosError {
        return error instanceof FspiopAxiosError;
    }
}

export class FspiopAxios {

    readonly settings: FspiopSettings;

    private readonly client: AxiosInstance;
    private readonly params: FspiopAxiosParams;
    private readonly interceptors: FspiopAxiosInterceptor[];
    private readonly defaultHeaders: FspiopHeadersMap;

    constructor(
        settings: FspiopSettings,
        params: FspiopAxiosParams = {},
        interceptors: FspiopAxiosInterceptor[] = [],
        headers: FspiopHeadersMap = {},
        httpsAgent?: https.Agent,
        client?: AxiosInstance,
    ) {
        this.settings = settings;
        this.params = params;
        this.interceptors = interceptors;
        this.defaultHeaders = headers;
        this.client = client ?? FspiopAxios.buildClient(params, interceptors, httpsAgent);
    }

    withHeaders(headers: FspiopHeadersMap): FspiopAxios {
        // client is already built with the agent baked in — pass it through directly
        return new FspiopAxios(this.settings, this.params, this.interceptors, headers, undefined, this.client);
    }

    // ─── Parties ────────────────────────────────────────────────────────────────

    async getParties(baseUrl: string, type: PartyIdType, id: string, subId?: string): Promise<void> {
        const url = subId
            ? `${baseUrl}/parties/${type}/${id}/${subId}`
            : `${baseUrl}/parties/${type}/${id}`;
        await this.get(url);
    }

    async putParties(baseUrl: string, type: PartyIdType, id: string, body: PartiesTypeIDPutResponse, subId?: string): Promise<void> {
        const url = subId
            ? `${baseUrl}/parties/${type}/${id}/${subId}`
            : `${baseUrl}/parties/${type}/${id}`;
        await this.put(url, body);
    }

    async putPartiesError(baseUrl: string, type: PartyIdType, id: string, response: ErrorInformationResponse, subId?: string): Promise<void> {
        const url = subId
            ? `${baseUrl}/parties/${type}/${id}/${subId}/error`
            : `${baseUrl}/parties/${type}/${id}/error`;
        await this.put(url, response);
    }

    // ─── Quotes ─────────────────────────────────────────────────────────────────

    async postQuotes(baseUrl: string, body: QuotesPostRequest): Promise<void> {
        await this.post(`${baseUrl}/quotes`, body);
    }

    async putQuotes(baseUrl: string, id: string, body: QuotesIDPutResponse): Promise<void> {
        await this.put(`${baseUrl}/quotes/${id}`, body);
    }

    async putQuotesError(baseUrl: string, id: string, response: ErrorInformationResponse): Promise<void> {
        await this.put(`${baseUrl}/quotes/${id}/error`, response);
    }

    // ─── Transfers ──────────────────────────────────────────────────────────────

    async postTransfers(baseUrl: string, body: TransfersPostRequest): Promise<void> {
        await this.post(`${baseUrl}/transfers`, body);
    }

    async putTransfers(baseUrl: string, id: string, body: TransfersIDPutResponse): Promise<void> {
        await this.put(`${baseUrl}/transfers/${id}`, body);
    }

    async patchTransfers(baseUrl: string, id: string, body: TransfersIDPatchResponse): Promise<void> {
        await this.patch(`${baseUrl}/transfers/${id}`, body);
    }

    async putTransfersError(baseUrl: string, id: string, response: ErrorInformationResponse): Promise<void> {
        await this.put(`${baseUrl}/transfers/${id}/error`, response);
    }

    // ─── FX Quotes ──────────────────────────────────────────────────────────────

    async postFxQuotes(baseUrl: string, body: FxQuotesPostRequest): Promise<void> {
        await this.post(`${baseUrl}/fxQuotes`, body);
    }

    async putFxQuotes(baseUrl: string, id: string, body: FxQuotesIDPutResponse): Promise<void> {
        await this.put(`${baseUrl}/fxQuotes/${id}`, body);
    }

    async putFxQuotesError(baseUrl: string, id: string, response: ErrorInformationResponse): Promise<void> {
        await this.put(`${baseUrl}/fxQuotes/${id}/error`, response);
    }

    // ─── FX Transfers ───────────────────────────────────────────────────────────

    async postFxTransfers(baseUrl: string, body: FxTransfersPostRequest): Promise<void> {
        await this.post(`${baseUrl}/fxTransfers`, body);
    }

    async putFxTransfers(baseUrl: string, id: string, body: FxTransfersIDPutResponse): Promise<void> {
        await this.put(`${baseUrl}/fxTransfers/${id}`, body);
    }

    async patchFxTransfers(baseUrl: string, id: string, body: FxTransfersIDPatchResponse): Promise<void> {
        await this.patch(`${baseUrl}/fxTransfers/${id}`, body);
    }

    async putFxTransfersError(baseUrl: string, id: string, response: ErrorInformationResponse): Promise<void> {
        await this.put(`${baseUrl}/fxTransfers/${id}/error`, response);
    }

    // ─── Internal ───────────────────────────────────────────────────────────────

    private async get(url: string): Promise<void> {
        await this.client.get(url, {headers: this.defaultHeaders});
    }

    private async post(url: string, body: unknown): Promise<void> {
        await this.client.post(url, body, {headers: this.defaultHeaders});
    }

    private async put(url: string, body: unknown): Promise<void> {
        await this.client.put(url, body, {headers: this.defaultHeaders});
    }

    private async patch(url: string, body: unknown): Promise<void> {
        await this.client.patch(url, body, {headers: this.defaultHeaders});
    }

    private static buildClient(
        params: FspiopAxiosParams,
        interceptors: FspiopAxiosInterceptor[],
        httpsAgent?: https.Agent,
    ): AxiosInstance {
        const instance = axios.create({
            timeout: params.socketTimeoutMs,
            httpAgent: params.connectionTimeoutMs
                ? new http.Agent({timeout: params.connectionTimeoutMs})
                : undefined,
            httpsAgent: httpsAgent ?? (params.connectionTimeoutMs
                ? new https.Agent({timeout: params.connectionTimeoutMs})
                : undefined),
        });

        for (const interceptor of interceptors) {
            instance.interceptors.request.use(interceptor);
        }

        instance.interceptors.response.use(
            (response) => response,
            (error: AxiosError) => {
                if (error.response) {
                    throw new FspiopAxiosError(
                        error.response.status,
                        error.response.data as ErrorInformationResponse,
                    );
                }
                throw error;
            },
        );

        return instance;
    }
}

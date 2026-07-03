// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import * as https from 'https';
import {AxiosError, AxiosInstance, InternalAxiosRequestConfig} from 'axios';
import {AxiosClientBuilder} from '@shared/axios/component';
import {FspiopHeadersMap} from '../fspiop-headers';
import {FspiopSettings} from '../fspiop-settings';
import {FspiopErrors} from '../../exception';
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
    /** Whether to verify the TLS certificate chain. */
    verifyServerCertificate?: boolean;
    /** Whether to verify server hostname/domain against certificate SAN/CN. */
    verifyDomain?: boolean;
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

    private static buildClient(
        params: FspiopAxiosParams,
        interceptors: FspiopAxiosInterceptor[],
        httpsAgent?: https.Agent,
    ): AxiosInstance {

        const builder = AxiosClientBuilder.newBuilder()
            .withParams(params)
            .withHttpLogger(true);

        if (httpsAgent != null) {
            builder.withHttpsAgent(httpsAgent);
        }

        for (const interceptor of interceptors) {
            builder.withRequestInterceptor(interceptor);
        }

        builder.withResponseInterceptor(
            (response) => response,
            (error: AxiosError) => {
                if (error.response) {
                    throw new FspiopAxiosError(
                        error.response.status,
                        error.response.data as ErrorInformationResponse,
                    );
                }

                throw new FspiopAxiosError(
                    502,
                    {
                        errorInformation: {
                            errorCode: FspiopErrors.DESTINATION_COMMUNICATION_ERROR.errorType.code,
                            errorDescription: FspiopAxios.transportErrorDescription(error),
                        },
                    },
                );
            },
        );

        const client = builder.build();

        FspiopAxios.clearDefaultAcceptHeaders(client);

        return client;
    }

    private static transportErrorDescription(error: AxiosError): string {
        const messageCandidates: string[] = [
            error.message,
        ];

        if (error.cause instanceof Error) {
            messageCandidates.push(error.cause.message);
        }

        const aggregateCause = error.cause as { errors?: unknown[] } | undefined;
        const aggregateErrors = aggregateCause?.errors;

        if (Array.isArray(aggregateErrors)) {
            for (const item of aggregateErrors) {
                if (item instanceof Error) {
                    messageCandidates.push(item.message);
                }
            }
        }

        for (const candidate of messageCandidates) {
            if (candidate.trim().length > 0) {
                return candidate;
            }
        }

        return FspiopErrors.DESTINATION_COMMUNICATION_ERROR.description;
    }


    // ─── Parties ────────────────────────────────────────────────────────────────

    async getParties(baseUrl: string, headers: FspiopHeadersMap, type: PartyIdType, id: string, subId?: string): Promise<void> {
        const url = subId
            ? `${baseUrl}/parties/${type}/${id}/${subId}`
            : `${baseUrl}/parties/${type}/${id}`;
        await this.get(url, headers);
    }

    async putParties(baseUrl: string, headers: FspiopHeadersMap, type: PartyIdType, id: string, body: PartiesTypeIDPutResponse, subId?: string): Promise<void> {
        const url = subId
            ? `${baseUrl}/parties/${type}/${id}/${subId}`
            : `${baseUrl}/parties/${type}/${id}`;
        await this.put(url, body, headers);
    }

    async putPartiesError(baseUrl: string, headers: FspiopHeadersMap, type: PartyIdType, id: string, response: ErrorInformationResponse, subId?: string): Promise<void> {
        const url = subId
            ? `${baseUrl}/parties/${type}/${id}/${subId}/error`
            : `${baseUrl}/parties/${type}/${id}/error`;
        await this.put(url, response, headers);
    }

    // ─── Quotes ─────────────────────────────────────────────────────────────────

    async postQuotes(baseUrl: string, headers: FspiopHeadersMap, body: QuotesPostRequest): Promise<void> {
        await this.post(`${baseUrl}/quotes`, body, headers);
    }

    async putQuotes(baseUrl: string, headers: FspiopHeadersMap, id: string, body: QuotesIDPutResponse): Promise<void> {
        await this.put(`${baseUrl}/quotes/${id}`, body, headers);
    }

    async putQuotesError(baseUrl: string, headers: FspiopHeadersMap, id: string, response: ErrorInformationResponse): Promise<void> {
        await this.put(`${baseUrl}/quotes/${id}/error`, response, headers);
    }

    // ─── Transfers ──────────────────────────────────────────────────────────────

    async postTransfers(baseUrl: string, headers: FspiopHeadersMap, body: TransfersPostRequest): Promise<void> {
        await this.post(`${baseUrl}/transfers`, body, headers);
    }

    async putTransfers(baseUrl: string, headers: FspiopHeadersMap, id: string, body: TransfersIDPutResponse): Promise<void> {
        await this.put(`${baseUrl}/transfers/${id}`, body, headers);
    }

    async patchTransfers(baseUrl: string, headers: FspiopHeadersMap, id: string, body: TransfersIDPatchResponse): Promise<void> {
        await this.patch(`${baseUrl}/transfers/${id}`, body, headers);
    }

    // ─── FX Quotes ──────────────────────────────────────────────────────────────

    async putTransfersError(baseUrl: string, headers: FspiopHeadersMap, id: string, response: ErrorInformationResponse): Promise<void> {
        await this.put(`${baseUrl}/transfers/${id}/error`, response, headers);
    }

    async postFxQuotes(baseUrl: string, headers: FspiopHeadersMap, body: FxQuotesPostRequest): Promise<void> {
        await this.post(`${baseUrl}/fxQuotes`, body, headers);
    }

    async putFxQuotes(baseUrl: string, headers: FspiopHeadersMap, id: string, body: FxQuotesIDPutResponse): Promise<void> {
        await this.put(`${baseUrl}/fxQuotes/${id}`, body, headers);
    }

    // ─── FX Transfers ───────────────────────────────────────────────────────────

    async putFxQuotesError(baseUrl: string, headers: FspiopHeadersMap, id: string, response: ErrorInformationResponse): Promise<void> {
        await this.put(`${baseUrl}/fxQuotes/${id}/error`, response, headers);
    }

    async postFxTransfers(baseUrl: string, headers: FspiopHeadersMap, body: FxTransfersPostRequest): Promise<void> {
        await this.post(`${baseUrl}/fxTransfers`, body, headers);
    }

    async putFxTransfers(baseUrl: string, headers: FspiopHeadersMap, id: string, body: FxTransfersIDPutResponse): Promise<void> {
        await this.put(`${baseUrl}/fxTransfers/${id}`, body, headers);
    }

    async patchFxTransfers(baseUrl: string, headers: FspiopHeadersMap, id: string, body: FxTransfersIDPatchResponse): Promise<void> {
        await this.patch(`${baseUrl}/fxTransfers/${id}`, body, headers);
    }

    async putFxTransfersError(baseUrl: string, headers: FspiopHeadersMap, id: string, response: ErrorInformationResponse): Promise<void> {
        await this.put(`${baseUrl}/fxTransfers/${id}/error`, response, headers);
    }

    private static clearDefaultAcceptHeaders(client: AxiosInstance): void {
        const defaultsHeaders = client.defaults.headers as Record<string, Record<string, unknown> | undefined>;
        const headerBuckets = [
            defaultsHeaders.common,
            defaultsHeaders.get,
            defaultsHeaders.post,
            defaultsHeaders.put,
            defaultsHeaders.patch,
            defaultsHeaders.delete,
            defaultsHeaders.head,
            defaultsHeaders.options,
        ];

        for (const bucket of headerBuckets) {
            if (bucket == null) {
                continue;
            }

            delete bucket.Accept;
            delete bucket.accept;
        }
    }

    private resolveHeaders(headers: FspiopHeadersMap | undefined): FspiopHeadersMap | undefined {
        const resolvedHeaders = {
            ...this.defaultHeaders,
            ...(headers ?? {}),
        };

        return Object.keys(resolvedHeaders).length > 0
            ? resolvedHeaders
            : undefined;
    }

    private async get(url: string, headers?: FspiopHeadersMap): Promise<void> {
        const resolvedHeaders = this.resolveHeaders(headers);

        if (resolvedHeaders == null) {
            await this.client.get(url);
            return;
        }

        await this.client.get(url, {headers: resolvedHeaders});
    }

    private async post(url: string, body: unknown, headers?: FspiopHeadersMap): Promise<void> {
        const resolvedHeaders = this.resolveHeaders(headers);

        if (resolvedHeaders == null) {
            await this.client.post(url, body);
            return;
        }

        await this.client.post(url, body, {headers: resolvedHeaders});
    }

    private async put(url: string, body: unknown, headers?: FspiopHeadersMap): Promise<void> {
        const resolvedHeaders = this.resolveHeaders(headers);

        if (resolvedHeaders == null) {
            await this.client.put(url, body);
            return;
        }

        await this.client.put(url, body, {headers: resolvedHeaders});
    }

    private async patch(url: string, body: unknown, headers?: FspiopHeadersMap): Promise<void> {
        const resolvedHeaders = this.resolveHeaders(headers);

        if (resolvedHeaders == null) {
            await this.client.patch(url, body);
            return;
        }

        await this.client.patch(url, body, {headers: resolvedHeaders});
    }
}

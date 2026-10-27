// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as https from 'https';
import {Logger} from '@nestjs/common';
import {AxiosError, AxiosInstance, InternalAxiosRequestConfig} from 'axios';
import {AxiosClientBuilder} from '@shared/axios/component';
import {ApiType} from '@shared/iso20022/api-type';
import {Iso20022ContentType, Iso20022Resource} from '@shared/iso20022/iso20022-content-type';
import type {Iso20022PostTransfersContext, Iso20022PutQuotesContext} from '@shared/iso20022/iso20022-transformer';
import {FspiopHeaders, FspiopHeadersMap} from '../fspiop-headers';
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

    private static readonly LOGGER = new Logger(FspiopAxios.name);

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

    private static async iso20022Transformer(): Promise<typeof import('../../../iso20022/iso20022-transformer').Iso20022Transformer> {
        return (await import('../../../iso20022/iso20022-transformer')).Iso20022Transformer;
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
        await this.get(url, this.resolveApiHeaders(headers, Iso20022Resource.Parties));
    }

    async putParties(baseUrl: string, headers: FspiopHeadersMap, type: PartyIdType, id: string, body: PartiesTypeIDPutResponse, subId?: string): Promise<void> {
        const url = subId
            ? `${baseUrl}/parties/${type}/${id}/${subId}`
            : `${baseUrl}/parties/${type}/${id}`;
        const resolvedHeaders = this.resolveApiHeaders(headers, Iso20022Resource.Parties);
        const resolvedBody = this.settings.apiType === ApiType.ISO20022
            ? await (await FspiopAxios.iso20022Transformer()).fspiopPutPartiesToIso(type, id, subId, body, resolvedHeaders)
            : body;
        await this.put(url, resolvedBody, resolvedHeaders);
    }

    async putPartiesError(baseUrl: string, headers: FspiopHeadersMap, type: PartyIdType, id: string, response: ErrorInformationResponse, subId?: string): Promise<void> {
        const url = subId
            ? `${baseUrl}/parties/${type}/${id}/${subId}/error`
            : `${baseUrl}/parties/${type}/${id}/error`;
        const resolvedHeaders = this.resolveApiHeaders(headers, Iso20022Resource.Parties);
        const resolvedBody = this.settings.apiType === ApiType.ISO20022
            ? await (await FspiopAxios.iso20022Transformer()).fspiopPutPartiesErrorToIso(type, id, subId, response, resolvedHeaders)
            : response;
        await this.put(url, resolvedBody, resolvedHeaders);
    }

    // ─── Quotes ─────────────────────────────────────────────────────────────────

    async postQuotes(baseUrl: string, headers: FspiopHeadersMap, body: QuotesPostRequest): Promise<void> {
        const resolvedHeaders = this.resolveApiHeaders(headers, Iso20022Resource.Quotes);
        const resolvedBody = this.settings.apiType === ApiType.ISO20022
            ? await (await FspiopAxios.iso20022Transformer()).fspiopPostQuotesToIso(body)
            : body;
        await this.post(`${baseUrl}/quotes`, resolvedBody, resolvedHeaders);
    }

    async putQuotes(
        baseUrl: string,
        headers: FspiopHeadersMap,
        id: string,
        body: QuotesIDPutResponse,
        iso20022Context?: Iso20022PutQuotesContext,
    ): Promise<void> {
        const resolvedHeaders = this.resolveApiHeaders(headers, Iso20022Resource.Quotes);
        const resolvedBody = this.settings.apiType === ApiType.ISO20022
            ? await (await FspiopAxios.iso20022Transformer()).fspiopPutQuotesToIso(id, body, resolvedHeaders, iso20022Context)
            : body;
        await this.put(`${baseUrl}/quotes/${id}`, resolvedBody, resolvedHeaders);
    }

    async putQuotesError(baseUrl: string, headers: FspiopHeadersMap, id: string, response: ErrorInformationResponse): Promise<void> {
        const resolvedHeaders = this.resolveApiHeaders(headers, Iso20022Resource.Quotes);
        const resolvedBody = this.settings.apiType === ApiType.ISO20022
            ? await (await FspiopAxios.iso20022Transformer()).fspiopPutQuotesErrorToIso(response)
            : response;
        await this.put(`${baseUrl}/quotes/${id}/error`, resolvedBody, resolvedHeaders);
    }

    // ─── Transfers ──────────────────────────────────────────────────────────────

    async postTransfers(
        baseUrl: string,
        headers: FspiopHeadersMap,
        body: TransfersPostRequest,
        iso20022Context?: Iso20022PostTransfersContext,
    ): Promise<void> {
        const resolvedHeaders = this.resolveApiHeaders(headers, Iso20022Resource.Transfers);
        const resolvedBody = this.settings.apiType === ApiType.ISO20022
            ? await (await FspiopAxios.iso20022Transformer()).fspiopPostTransfersToIso(body, resolvedHeaders, iso20022Context)
            : body;
        await this.post(`${baseUrl}/transfers`, resolvedBody, resolvedHeaders);
    }

    async putTransfers(baseUrl: string, headers: FspiopHeadersMap, id: string, body: TransfersIDPutResponse): Promise<void> {
        const resolvedHeaders = this.resolveApiHeaders(headers, Iso20022Resource.Transfers);
        const resolvedBody = this.settings.apiType === ApiType.ISO20022
            ? await (await FspiopAxios.iso20022Transformer()).fspiopPutTransfersToIso(body)
            : body;
        await this.put(`${baseUrl}/transfers/${id}`, resolvedBody, resolvedHeaders);
    }

    async patchTransfers(baseUrl: string, headers: FspiopHeadersMap, id: string, body: TransfersIDPatchResponse): Promise<void> {
        const resolvedHeaders = this.resolveApiHeaders(headers, Iso20022Resource.Transfers);
        const resolvedBody = this.settings.apiType === ApiType.ISO20022
            ? await (await FspiopAxios.iso20022Transformer()).fspiopPatchTransfersToIso(body)
            : body;
        await this.patch(`${baseUrl}/transfers/${id}`, resolvedBody, resolvedHeaders);
    }

    // ─── FX Quotes ──────────────────────────────────────────────────────────────

    async putTransfersError(baseUrl: string, headers: FspiopHeadersMap, id: string, response: ErrorInformationResponse): Promise<void> {
        const resolvedHeaders = this.resolveApiHeaders(headers, Iso20022Resource.Transfers);
        const resolvedBody = this.settings.apiType === ApiType.ISO20022
            ? await (await FspiopAxios.iso20022Transformer()).fspiopPutTransfersErrorToIso(response)
            : response;
        await this.put(`${baseUrl}/transfers/${id}/error`, resolvedBody, resolvedHeaders);
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

        if (resolvedHeaders['content-type'] != null) {
            delete resolvedHeaders['Content-Type'];
        }

        return Object.keys(resolvedHeaders).length > 0
            ? resolvedHeaders
            : undefined;
    }

    private resolveApiHeaders(
        headers: FspiopHeadersMap,
        resource: Iso20022Resource,
    ): FspiopHeadersMap {
        if (this.settings.apiType !== ApiType.ISO20022) {
            FspiopAxios.LOGGER.log(`API_TYPE=${this.settings.apiType}; resource=${resource}; using original FSPIOP headers`);
            return headers;
        }

        const contentType = Iso20022ContentType.forResource(resource, this.settings.apiType);

        FspiopAxios.LOGGER.log(`API_TYPE=${this.settings.apiType}; resource=${resource}; content-type=${contentType}`);

        const resolvedHeaders = {...headers};

        delete resolvedHeaders.Accept;
        delete resolvedHeaders['Content-Type'];

        resolvedHeaders[FspiopHeaders.Names.ACCEPT] = contentType;
        resolvedHeaders[FspiopHeaders.Names.CONTENT_TYPE] = contentType;

        return resolvedHeaders;
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

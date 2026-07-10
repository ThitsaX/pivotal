// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as http from 'http';
import * as https from 'https';
import axios, {AxiosError, AxiosInstance, AxiosResponse, CreateAxiosDefaults, InternalAxiosRequestConfig,} from 'axios';
import {CaStore, ClientCertStore} from '@shared/security/component/cert';
import {HttpLoggerInterceptor} from './interceptor';

export interface AxiosClientBuilderParams {
    /** Timeout (ms) waiting for response data after the connection is established. */
    socketTimeoutMs?: number;
    /** Timeout (ms) to establish the TCP connection. */
    connectionTimeoutMs?: number;
    /** Whether to verify the TLS certificate chain. */
    verifyServerCertificate?: boolean;
    /** Whether to verify server hostname/domain against certificate SAN/CN. */
    verifyDomain?: boolean;
}

export interface AxiosClientMutualTlsOptions {
    ca?: Buffer;
    cert?: Buffer;
    key?: Buffer;
    passphrase?: string;
    rejectUnauthorized?: boolean;
}

export interface AxiosClientMutualTlsStoreOptions {
    caStore?: CaStore;
    clientCertStore?: ClientCertStore;
    passphrase?: string;
    rejectUnauthorized?: boolean;
}

export type AxiosClientRequestInterceptor = (
    config: InternalAxiosRequestConfig,
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;

export type AxiosClientRequestErrorInterceptor = (
    error: unknown,
) => unknown;

export type AxiosClientResponseInterceptor = (
    response: AxiosResponse,
) => AxiosResponse | Promise<AxiosResponse>;

export type AxiosClientResponseErrorInterceptor = (
    error: AxiosError | unknown,
) => unknown;

interface AxiosClientRequestInterceptorEntry {
    onFulfilled: AxiosClientRequestInterceptor;
    onRejected?: AxiosClientRequestErrorInterceptor;
}

interface AxiosClientResponseInterceptorEntry {
    onFulfilled?: AxiosClientResponseInterceptor;
    onRejected?: AxiosClientResponseErrorInterceptor;
}

export class AxiosClientBuilder {

    private readonly defaults: CreateAxiosDefaults = {};
    private readonly defaultHeaders: Record<string, string> = {};
    private readonly requestInterceptors: AxiosClientRequestInterceptorEntry[] = [];
    private readonly responseInterceptors: AxiosClientResponseInterceptorEntry[] = [];

    private params: AxiosClientBuilderParams = {};
    private httpAgent: http.Agent | undefined;
    private httpsAgent: https.Agent | undefined;
    private mutualTlsOptions: AxiosClientMutualTlsOptions | undefined;
    private httpLoggerEnabled = false;

    static newBuilder(): AxiosClientBuilder {
        return new AxiosClientBuilder();
    }

    private static createMutualTlsAgent(
        options: AxiosClientMutualTlsOptions,
        params?: AxiosClientBuilderParams,
    ): https.Agent {
        const checkServerIdentity = AxiosClientBuilder.resolveCheckServerIdentity(params?.verifyDomain);

        return new https.Agent({
                                   ca: options.ca,
                                   cert: options.cert,
                                   key: options.key,
                                   passphrase: options.passphrase,
                                   rejectUnauthorized: options.rejectUnauthorized ?? params?.verifyServerCertificate,
                                   timeout: params?.connectionTimeoutMs,
                                   ...(checkServerIdentity != null
                                       ? {checkServerIdentity}
                                       : {}),
                               });
    }

    private static resolveCheckServerIdentity(
        verifyDomain?: boolean,
    ): https.AgentOptions['checkServerIdentity'] | undefined {
        if (verifyDomain !== false) {
            return undefined;
        }

        return () => undefined;
    }

    private static mergeHeaders(
        current: CreateAxiosDefaults['headers'],
        incoming: Record<string, string>,
    ): CreateAxiosDefaults['headers'] {
        const existing = AxiosClientBuilder.toPlainRecord(current);

        return {
            ...existing,
            ...incoming,
        };
    }

    private static toPlainRecord(value: unknown): Record<string, unknown> {
        if (value == null) {
            return {};
        }

        if (typeof value === 'object') {
            const candidate = value as { toJSON?: () => unknown };

            if (typeof candidate.toJSON === 'function') {
                const json = candidate.toJSON();
                if (json != null && typeof json === 'object') {
                    return json as Record<string, unknown>;
                }
            }

            return value as Record<string, unknown>;
        }

        return {};
    }

    withDefaults(defaults: CreateAxiosDefaults): AxiosClientBuilder {
        Object.assign(this.defaults, defaults);

        return this;
    }

    withBaseUrl(baseUrl: string): AxiosClientBuilder {

        this.defaults.baseURL = baseUrl;

        return this;
    }

    withParams(params: AxiosClientBuilderParams): AxiosClientBuilder {

        this.params = {
            ...this.params,
            ...params,
        };

        return this;
    }

    withSocketTimeoutMs(socketTimeoutMs: number): AxiosClientBuilder {

        this.params.socketTimeoutMs = socketTimeoutMs;

        return this;
    }

    withConnectionTimeoutMs(connectionTimeoutMs: number): AxiosClientBuilder {

        this.params.connectionTimeoutMs = connectionTimeoutMs;

        return this;
    }

    withDefaultHeaders(headers: Record<string, string>): AxiosClientBuilder {

        Object.assign(this.defaultHeaders, headers);

        return this;
    }

    withRequestInterceptor(
        onFulfilled: AxiosClientRequestInterceptor,
        onRejected?: AxiosClientRequestErrorInterceptor,
    ): AxiosClientBuilder {

        this.requestInterceptors.push({
                                          onFulfilled,
                                          onRejected,
                                      });

        return this;
    }

    withResponseInterceptor(
        onFulfilled?: AxiosClientResponseInterceptor,
        onRejected?: AxiosClientResponseErrorInterceptor,
    ): AxiosClientBuilder {
        this.responseInterceptors.push({
                                           onFulfilled,
                                           onRejected,
                                       });

        return this;
    }

    withHttpAgent(httpAgent: http.Agent): AxiosClientBuilder {

        this.httpAgent = httpAgent;

        return this;
    }

    withHttpsAgent(httpsAgent: https.Agent): AxiosClientBuilder {

        this.httpsAgent = httpsAgent;

        return this;
    }

    withHttpLogger(enabled: boolean): AxiosClientBuilder {

        this.httpLoggerEnabled = enabled;

        return this;
    }

    withMutualTls(options: AxiosClientMutualTlsOptions): AxiosClientBuilder {

        this.mutualTlsOptions = {
            ...options,
        };

        return this;
    }

    withMutualTlsFromStores(options: AxiosClientMutualTlsStoreOptions): AxiosClientBuilder {

        const clientCert = options.clientCertStore?.get();

        this.mutualTlsOptions = {
            ca: options.caStore?.get()?.toBuffer(),
            cert: clientCert?.certBuffer(),
            key: clientCert?.keyBuffer(),
            passphrase: options.passphrase,
            rejectUnauthorized: options.rejectUnauthorized,
        };

        return this;
    }

    withoutMutualTls(): AxiosClientBuilder {

        this.mutualTlsOptions = undefined;

        return this;
    }

    build(): AxiosInstance {

        const config: CreateAxiosDefaults = {
            ...this.defaults,
        };

        if (Object.keys(this.defaultHeaders).length > 0) {
            config.headers = AxiosClientBuilder.mergeHeaders(config.headers, this.defaultHeaders);
        }

        if (config.timeout == null && this.params.socketTimeoutMs != null) {
            config.timeout = this.params.socketTimeoutMs;
        }

        if (this.httpAgent != null) {
            config.httpAgent = this.httpAgent;
        } else if (config.httpAgent == null && this.params.connectionTimeoutMs != null) {
            config.httpAgent = new http.Agent({
                                                  timeout: this.params.connectionTimeoutMs,
                                              });
        }

        if (this.httpsAgent != null) {
            config.httpsAgent = this.httpsAgent;
        } else if (this.mutualTlsOptions != null) {
            config.httpsAgent = AxiosClientBuilder.createMutualTlsAgent(
                this.mutualTlsOptions,
                this.params,
            );
        } else if (config.httpsAgent == null && this.params.connectionTimeoutMs != null) {
            const checkServerIdentity = AxiosClientBuilder.resolveCheckServerIdentity(this.params.verifyDomain);

            config.httpsAgent = new https.Agent({
                                                    rejectUnauthorized: this.params.verifyServerCertificate,
                                                    timeout: this.params.connectionTimeoutMs,
                                                    ...(checkServerIdentity != null
                                                        ? {checkServerIdentity}
                                                        : {}),
                                                });
        }

        const instance = axios.create(config);
        const httpLoggerInterceptor = this.httpLoggerEnabled
            ? new HttpLoggerInterceptor()
            : undefined;

        if (httpLoggerInterceptor != null) {
            // Axios request interceptors run in LIFO order.
            // Register logger first so it logs the final request after user interceptors mutate it.
            instance.interceptors.request.use(httpLoggerInterceptor.requestInterceptor());
        }

        for (const interceptor of this.requestInterceptors) {
            instance.interceptors.request.use(interceptor.onFulfilled, interceptor.onRejected);
        }

        for (const interceptor of this.responseInterceptors) {
            instance.interceptors.response.use(interceptor.onFulfilled, interceptor.onRejected);
        }

        if (httpLoggerInterceptor != null) {
            // Axios response interceptors run in FIFO order.
            // Register logger last so it logs the final response after user interceptors mutate it.
            instance.interceptors.response.use(
                httpLoggerInterceptor.responseInterceptor(),
                httpLoggerInterceptor.responseErrorInterceptor(),
            );
        }

        return instance;
    }
}

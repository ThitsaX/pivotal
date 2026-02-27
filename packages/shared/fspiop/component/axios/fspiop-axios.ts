import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Configuration } from './configuration';
import { AuthorizationsApi } from './api/authorizations-api';
import { BulkQuotesApi } from './api/bulk-quotes-api';
import { BulkTransfersApi } from './api/bulk-transfers-api';
import { FxQuotesApi } from './api/fx-quotes-api';
import { FxTransfersApi } from './api/fx-transfers-api';
import { ParticipantsApi } from './api/participants-api';
import { PartiesApi } from './api/parties-api';
import { QuotesApi } from './api/quotes-api';
import { ServicesFXPApi } from './api/services-fxpapi';
import { TransactionRequestsApi } from './api/transaction-requests-api';
import { TransactionsApi } from './api/transactions-api';
import { TransfersApi } from './api/transfers-api';
import { FspiopHeadersMap } from '../fspiop-headers';
import { ErrorInformationResponse } from '../../dto/error-information-response';

/**
 * Connection parameters for FspiopAxios.
 * Auth values (apiKey, token, etc.) are intentionally excluded — inject them
 * dynamically at call time via FspiopAxiosInterceptor instead.
 */
export interface FspiopAxiosParams {
    basePath?: string;
    serverIndex?: number;
    baseOptions?: any;
    formDataCtor?: new () => any;
}

/**
 * Retrofit-style request interceptor.
 * Receives the outgoing Axios request config and must return it (optionally modified).
 * Use this to inject dynamic values such as auth tokens, signatures, or correlation IDs.
 *
 * @example — inject a bearer token
 * const interceptor: FspiopAxiosInterceptor = async (config) => {
 *   config.headers['Authorization'] = `Bearer ${await tokenService.getToken()}`;
 *   return config;
 * };
 *
 * @example — add a request signature
 * const interceptor: FspiopAxiosInterceptor = (config) => {
 *   config.headers['X-Signature'] = sign(config);
 *   return config;
 * };
 */
export type FspiopAxiosInterceptor = (
    config: InternalAxiosRequestConfig,
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;

export class FspiopAxiosError extends Error {
    constructor(
        public readonly status: number,
        public readonly errorInformation: ErrorInformationResponse,
    ) {
        const desc = errorInformation.errorInformation?.errorDescription ?? 'unknown';
        const code = errorInformation.errorInformation?.errorCode ?? '0000';
        super(`FSPIOP error [${status}] ${code}: ${desc}`);
        this.name = 'FspiopAxiosError';
    }

    static is(error: unknown): error is FspiopAxiosError {
        return error instanceof FspiopAxiosError;
    }
}

export class FspiopAxios {
    readonly authorizations: AuthorizationsApi;
    readonly bulkQuotes: BulkQuotesApi;
    readonly bulkTransfers: BulkTransfersApi;
    readonly fxQuotes: FxQuotesApi;
    readonly fxTransfers: FxTransfersApi;
    readonly participants: ParticipantsApi;
    readonly parties: PartiesApi;
    readonly quotes: QuotesApi;
    readonly servicesFxp: ServicesFXPApi;
    readonly transactionRequests: TransactionRequestsApi;
    readonly transactions: TransactionsApi;
    readonly transfers: TransfersApi;

    private readonly params: FspiopAxiosParams;
    private readonly interceptors: FspiopAxiosInterceptor[];

    constructor(
        params: FspiopAxiosParams = {},
        interceptors: FspiopAxiosInterceptor[] = [],
        headers: FspiopHeadersMap = {},
    ) {
        this.params = params;
        this.interceptors = interceptors;

        const axiosInstance = FspiopAxios.createAxiosInstance(interceptors);
        const config = FspiopAxios.createConfig(params, headers);

        this.authorizations = new AuthorizationsApi(config, undefined, axiosInstance);
        this.bulkQuotes = new BulkQuotesApi(config, undefined, axiosInstance);
        this.bulkTransfers = new BulkTransfersApi(config, undefined, axiosInstance);
        this.fxQuotes = new FxQuotesApi(config, undefined, axiosInstance);
        this.fxTransfers = new FxTransfersApi(config, undefined, axiosInstance);
        this.participants = new ParticipantsApi(config, undefined, axiosInstance);
        this.parties = new PartiesApi(config, undefined, axiosInstance);
        this.quotes = new QuotesApi(config, undefined, axiosInstance);
        this.servicesFxp = new ServicesFXPApi(config, undefined, axiosInstance);
        this.transactionRequests = new TransactionRequestsApi(config, undefined, axiosInstance);
        this.transactions = new TransactionsApi(config, undefined, axiosInstance);
        this.transfers = new TransfersApi(config, undefined, axiosInstance);
    }

    withHeaders(headers: FspiopHeadersMap): FspiopAxios {
        return new FspiopAxios(this.params, this.interceptors, headers);
    }

    private static createConfig(params: FspiopAxiosParams, headers: FspiopHeadersMap): Configuration {
        return new Configuration({
            ...params,
            baseOptions: {
                ...params.baseOptions,
                headers: {
                    ...params.baseOptions?.headers,
                    ...headers,
                },
            },
        });
    }

    private static createAxiosInstance(interceptors: FspiopAxiosInterceptor[]): AxiosInstance {
        const instance = axios.create();

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

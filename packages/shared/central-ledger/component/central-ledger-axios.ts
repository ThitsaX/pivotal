import {AxiosError, AxiosInstance, InternalAxiosRequestConfig} from 'axios';
import {AxiosClientBuilder} from '@shared/axios/component';
import {CentralLedgerException} from '../exception';
import {
    CurrencyIsActive,
    GetTransactionResponse,
    LedgerAccountType,
    ParticipantIsActive,
    Participants,
    PostInitialPositionAndLimitsRequest,
    PostParticipantsNameAccountsRequest,
    PostParticipantsNameEndpointsRequest,
    PostParticipantsRequest,
    PutParticipantsNameLimitsRequest,
    RecordFundsOut,
    SettlementModel,
    SettlementModelIsActive,
} from '../dto';

export type CentralLedgerHeadersMap = Record<string, string>;
type CentralLedgerQueryValue = string | number | boolean | null | undefined;

export interface CentralLedgerAxiosParams {
    socketTimeoutMs?: number;
    connectionTimeoutMs?: number;
}

export type CentralLedgerParticipantsQuery = Record<string, CentralLedgerQueryValue> & {
    isProxy?: boolean | string | number | null;
};

export type CentralLedgerParticipantLimitsQuery = Record<string, CentralLedgerQueryValue> & {
    currency?: string;
    type?: string;
};

export type CentralLedgerParticipantPositionsQuery = Record<string, CentralLedgerQueryValue> & {
    currency?: string;
};

export type CentralLedgerAxiosInterceptor = (
    config: InternalAxiosRequestConfig,
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;

export class CentralLedgerAxios {

    private static readonly DEFAULT_SOCKET_TIMEOUT_MS = 10_000;
    private static readonly DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

    readonly centralLedgerUrl: string;

    private readonly client: AxiosInstance;
    private readonly params: CentralLedgerAxiosParams;
    private readonly interceptors: CentralLedgerAxiosInterceptor[];
    private readonly defaultHeaders: CentralLedgerHeadersMap;

    constructor(
        centralLedgerUrl: string,
        params: CentralLedgerAxiosParams = {},
        interceptors: CentralLedgerAxiosInterceptor[] = [],
        headers: CentralLedgerHeadersMap = {},
        client?: AxiosInstance,
    ) {
        const resolvedParams: CentralLedgerAxiosParams = {
            socketTimeoutMs: params.socketTimeoutMs ?? CentralLedgerAxios.DEFAULT_SOCKET_TIMEOUT_MS,
            connectionTimeoutMs: params.connectionTimeoutMs ?? CentralLedgerAxios.DEFAULT_CONNECTION_TIMEOUT_MS,
        };

        this.centralLedgerUrl = CentralLedgerAxios.normalizeBaseUrl(centralLedgerUrl);
        this.params = resolvedParams;
        this.interceptors = interceptors;
        this.defaultHeaders = headers;
        this.client = client ?? CentralLedgerAxios.buildClient(resolvedParams, interceptors);
    }

    private static buildClient(
        params: CentralLedgerAxiosParams,
        interceptors: CentralLedgerAxiosInterceptor[],
    ): AxiosInstance {

        const builder = AxiosClientBuilder.newBuilder()
            .withParams(params);

        for (const interceptor of interceptors) {
            builder.withRequestInterceptor(interceptor);
        }

        builder.withResponseInterceptor(
            (response) => response,
            (error: AxiosError) => {
                throw CentralLedgerAxios.toCentralLedgerException(error);
            },
        );

        return builder.build();
    }

    private static normalizeBaseUrl(url: string): string {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }

    private static toCentralLedgerException(error: AxiosError): CentralLedgerException {
        const status = error.response?.status ?? 503;
        const data = error.response?.data;

        const code = error.response != null
            ? CentralLedgerAxios.resolveResponseCode(status, data)
            : 'CENTRAL_LEDGER_COMMUNICATION_ERROR';
        const message = CentralLedgerAxios.resolveErrorMessage(status, data, error);

        return new CentralLedgerException(code, `Central Ledger (${code}) ${message}`);
    }

    private static resolveResponseCode(status: number, data: unknown): string {
        const bodyCode = CentralLedgerAxios.readStringField(data, 'code');

        if (bodyCode != null && bodyCode.trim().length > 0) {
            return bodyCode.trim();
        }

        return `CENTRAL_LEDGER_HTTP_${status}`;
    }

    private static resolveErrorMessage(status: number, data: unknown, error: AxiosError): string {
        const responseMessage = CentralLedgerAxios.resolveResponseMessage(data);
        const transportMessage = CentralLedgerAxios.resolveTransportMessage(error);

        const message = CentralLedgerAxios.firstNonBlank(
            responseMessage,
            transportMessage,
            `Central Ledger request failed with HTTP ${status}.`,
        );

        return message ?? `Central Ledger request failed with HTTP ${status}.`;
    }

    private static resolveResponseMessage(data: unknown): string | undefined {
        if (typeof data === 'string') {
            return data;
        }

        const message = CentralLedgerAxios.readStringField(data, 'message');
        if (message != null && message.trim().length > 0) {
            return message;
        }

        const detail = CentralLedgerAxios.readStringField(data, 'detail');
        if (detail != null && detail.trim().length > 0) {
            return detail;
        }

        const error = CentralLedgerAxios.readStringField(data, 'error');
        if (error != null && error.trim().length > 0) {
            return error;
        }

        const nestedError = CentralLedgerAxios.readNestedStringField(data, 'error', 'message');
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

        return CentralLedgerAxios.firstNonBlank(...candidates);
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

    withHeaders(headers: CentralLedgerHeadersMap): CentralLedgerAxios {
        return new CentralLedgerAxios(this.centralLedgerUrl, this.params, this.interceptors, headers, this.client);
    }

    async getEnums(): Promise<unknown> {
        return this.get('/enums');
    }

    async getHealth(): Promise<unknown> {
        return this.get('/health');
    }

    async getMetrics(): Promise<unknown> {
        return this.get('/metrics');
    }

    async getParticipants(query: CentralLedgerParticipantsQuery = {}): Promise<unknown> {
        return this.get('/participants', query);
    }

    async createParticipant(body: PostParticipantsRequest): Promise<unknown> {
        return this.post('/participants', body);
    }

    async getParticipantsLimits(query: CentralLedgerParticipantLimitsQuery = {}): Promise<unknown> {
        return this.get('/participants/limits', query);
    }

    async getParticipant(name: string): Promise<unknown> {
        return this.get(`/participants/${CentralLedgerAxios.encodePathSegment(name)}`);
    }

    async updateParticipant(name: string, body: ParticipantIsActive): Promise<unknown> {
        return this.put(`/participants/${CentralLedgerAxios.encodePathSegment(name)}`, body);
    }

    async getParticipantEndpoints(name: string): Promise<unknown> {
        return this.get(`/participants/${CentralLedgerAxios.encodePathSegment(name)}/endpoints`);
    }

    async upsertParticipantEndpoints(name: string, body: PostParticipantsNameEndpointsRequest): Promise<unknown> {
        return this.post(`/participants/${CentralLedgerAxios.encodePathSegment(name)}/endpoints`, body);
    }

    async getParticipantLimits(name: string, query: CentralLedgerParticipantLimitsQuery = {}): Promise<unknown> {
        return this.get(`/participants/${CentralLedgerAxios.encodePathSegment(name)}/limits`, query);
    }

    async updateParticipantLimits(name: string, body: PutParticipantsNameLimitsRequest): Promise<unknown> {
        return this.put(`/participants/${CentralLedgerAxios.encodePathSegment(name)}/limits`, body);
    }

    async getParticipantPositions(name: string, query: CentralLedgerParticipantPositionsQuery = {}): Promise<unknown> {
        return this.get(`/participants/${CentralLedgerAxios.encodePathSegment(name)}/positions`, query);
    }

    async getParticipantAccounts(name: string): Promise<unknown> {
        return this.get(`/participants/${CentralLedgerAxios.encodePathSegment(name)}/accounts`);
    }

    async createParticipantAccounts(name: string, body: PostParticipantsNameAccountsRequest): Promise<unknown> {
        return this.post(`/participants/${CentralLedgerAxios.encodePathSegment(name)}/accounts`, body);
    }

    async createParticipantInitialPositionAndLimits(
        name: string,
        body: PostInitialPositionAndLimitsRequest,
    ): Promise<unknown> {
        return this.post(`/participants/${CentralLedgerAxios.encodePathSegment(name)}/initialPositionAndLimits`, body);
    }

    async recordParticipantFunds(name: string, id: number, body: Participants): Promise<unknown> {
        const encodedName = CentralLedgerAxios.encodePathSegment(name);
        const encodedId = CentralLedgerAxios.encodePathSegment(id);

        return this.post(`/participants/${encodedName}/accounts/${encodedId}`, body);
    }

    async updateParticipantAccount(name: string, id: number, body: CurrencyIsActive): Promise<unknown> {
        const encodedName = CentralLedgerAxios.encodePathSegment(name);
        const encodedId = CentralLedgerAxios.encodePathSegment(id);

        return this.put(`/participants/${encodedName}/accounts/${encodedId}`, body);
    }

    async updateParticipantTransfer(
        name: string,
        id: number,
        transferId: string,
        body: RecordFundsOut,
    ): Promise<unknown> {
        const encodedName = CentralLedgerAxios.encodePathSegment(name);
        const encodedId = CentralLedgerAxios.encodePathSegment(id);
        const encodedTransferId = CentralLedgerAxios.encodePathSegment(transferId);

        return this.put(`/participants/${encodedName}/accounts/${encodedId}/transfers/${encodedTransferId}`, body);
    }

    async getLedgerAccountTypes(): Promise<Array<LedgerAccountType>> {
        return this.get('/ledgerAccountTypes');
    }

    async createLedgerAccountType(body: LedgerAccountType): Promise<unknown> {
        return this.post('/ledgerAccountTypes', body);
    }

    async getSettlementModels(): Promise<unknown> {
        return this.get('/settlementModels');
    }

    async createSettlementModel(body: SettlementModel): Promise<unknown> {
        return this.post('/settlementModels', body);
    }

    async getSettlementModel(name: string): Promise<unknown> {
        return this.get(`/settlementModels/${CentralLedgerAxios.encodePathSegment(name)}`);
    }

    async updateSettlementModel(name: string, body: SettlementModelIsActive): Promise<unknown> {
        return this.put(`/settlementModels/${CentralLedgerAxios.encodePathSegment(name)}`, body);
    }

    async getTransaction(id: string): Promise<GetTransactionResponse> {
        return this.get(`/transactions/${CentralLedgerAxios.encodePathSegment(id)}`);
    }

    private async get<ResponseType>(
        path: string,
        query?: Record<string, CentralLedgerQueryValue>,
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

    private async put<ResponseType, RequestType = unknown>(
        path: string,
        body: RequestType,
    ): Promise<ResponseType> {
        const response = await this.client.put<ResponseType>(
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
            return `${this.centralLedgerUrl}${path}`;
        }

        return `${this.centralLedgerUrl}/${path}`;
    }
}

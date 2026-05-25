const DEFAULT_API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:3202`;

export const API_BASE_URL = (
    (import.meta.env.VITE_WEB_PIVOTAL_API_BASE_URL as string | undefined)
    ?? (import.meta.env.VITE_AUDIT_API_BASE_URL as string | undefined)
    ?? DEFAULT_API_BASE_URL
).replace(/\/$/, '');

export interface ApiErrorBody {
    code?: string;
    message?: string;
}

export class ApiError extends Error {

    constructor(
        public readonly status: number,
        public readonly code: string | undefined,
        message: string,
        public readonly body: unknown,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

let accessToken: string | null = null;
let refreshHandler: (() => Promise<boolean>) | null = null;
let sessionExpiredHandler: (() => void) | null = null;
let inFlightRefresh: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
    accessToken = token;
}

export function registerRefreshHandler(handler: () => Promise<boolean>): void {
    refreshHandler = handler;
}

export function registerSessionExpiredHandler(handler: () => void): void {
    sessionExpiredHandler = handler;
}

async function refreshOnce(): Promise<boolean> {

    if (inFlightRefresh != null) {
        return inFlightRefresh;
    }

    if (refreshHandler == null) {
        return false;
    }

    inFlightRefresh = refreshHandler().finally((): void => {
        inFlightRefresh = null;
    });

    return inFlightRefresh;
}

interface RequestOptions {
    skipAuthRetry?: boolean;
}

async function parseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
        return response.json();
    }

    const text = await response.text();

    if (text.trim().length === 0) {
        return null;
    }

    return text;
}

function toErrorMessage(status: number, body: unknown, statusText: string): {code?: string; message: string} {
    const errorBody = (body != null && typeof body === 'object') ? body as ApiErrorBody : null;
    const code = errorBody?.code?.trim();
    const message = errorBody?.message?.trim();

    if (message != null && message.length > 0) {
        return {code: code != null && code.length > 0 ? code : undefined, message};
    }

    if (code != null && code.length > 0) {
        return {code, message: code};
    }

    return {message: `${status} ${statusText}`.trim()};
}

async function dispatch(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions,
): Promise<Response> {

    const headers: Record<string, string> = {Accept: 'application/json'};

    if (body !== undefined && body !== null) {
        headers['Content-Type'] = 'application/json';
    }

    if (accessToken != null) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    const init: RequestInit = {
        method,
        headers,
        credentials: 'include',
    };

    if (body !== undefined && body !== null) {
        init.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, init);

    if (response.status !== 401 || options.skipAuthRetry === true) {
        return response;
    }

    const refreshed = await refreshOnce();

    if (!refreshed) {
        sessionExpiredHandler?.();

        return response;
    }

    if (accessToken != null) {
        headers.Authorization = `Bearer ${accessToken}`;
    } else {
        delete headers.Authorization;
    }

    return fetch(`${API_BASE_URL}${path}`, init);
}

async function request<T>(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions = {},
): Promise<T> {

    const response = await dispatch(method, path, body, options);
    const parsed = await parseBody(response);

    if (!response.ok) {
        const {code, message} = toErrorMessage(response.status, parsed, response.statusText);

        throw new ApiError(response.status, code, message, parsed);
    }

    return parsed as T;
}

function get<T>(path: string): Promise<T> {
    return request<T>('GET', path, undefined, {});
}

function post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('POST', path, body, {});
}

function patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('PATCH', path, body, {});
}

function put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('PUT', path, body, {});
}

function del<T>(path: string): Promise<T> {
    return request<T>('DELETE', path, undefined, {});
}

function postWithoutAuthRetry<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('POST', path, body, {skipAuthRetry: true});
}

export const apiClient = {
    get,
    post,
    patch,
    put,
    delete: del,
    postWithoutAuthRetry,
};

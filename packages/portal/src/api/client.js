const DEFAULT_API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:3202`;
export const API_BASE_URL = (import.meta.env.VITE_WEB_PIVOTAL_API_BASE_URL
    ?? import.meta.env.VITE_AUDIT_API_BASE_URL
    ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');
export class ApiError extends Error {
    constructor(status, code, message, body) {
        super(message);
        this.status = status;
        this.code = code;
        this.body = body;
        this.name = 'ApiError';
    }
}
let accessToken = null;
let refreshHandler = null;
let sessionExpiredHandler = null;
let inFlightRefresh = null;
export function setAccessToken(token) {
    accessToken = token;
}
export function registerRefreshHandler(handler) {
    refreshHandler = handler;
}
export function registerSessionExpiredHandler(handler) {
    sessionExpiredHandler = handler;
}
async function refreshOnce() {
    if (inFlightRefresh != null) {
        return inFlightRefresh;
    }
    if (refreshHandler == null) {
        return false;
    }
    inFlightRefresh = refreshHandler().finally(() => {
        inFlightRefresh = null;
    });
    return inFlightRefresh;
}
async function parseBody(response) {
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
function toErrorMessage(status, body, statusText) {
    const errorBody = (body != null && typeof body === 'object') ? body : null;
    const code = errorBody?.code?.trim();
    const message = errorBody?.message?.trim();
    if (message != null && message.length > 0) {
        return { code: code != null && code.length > 0 ? code : undefined, message };
    }
    if (code != null && code.length > 0) {
        return { code, message: code };
    }
    return { message: `${status} ${statusText}`.trim() };
}
async function dispatch(method, path, body, options) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined && body !== null) {
        headers['Content-Type'] = 'application/json';
    }
    if (accessToken != null) {
        headers.Authorization = `Bearer ${accessToken}`;
    }
    const init = {
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
    }
    else {
        delete headers.Authorization;
    }
    return fetch(`${API_BASE_URL}${path}`, init);
}
async function request(method, path, body, options = {}) {
    const response = await dispatch(method, path, body, options);
    const parsed = await parseBody(response);
    if (!response.ok) {
        const { code, message } = toErrorMessage(response.status, parsed, response.statusText);
        throw new ApiError(response.status, code, message, parsed);
    }
    return parsed;
}
export const apiClient = {
    get: (path) => request('GET', path, undefined, {}),
    post: (path, body) => request('POST', path, body, {}),
    put: (path, body) => request('PUT', path, body, {}),
    delete: (path) => request('DELETE', path, undefined, {}),
    postWithoutAuthRetry: (path, body) => request('POST', path, body, { skipAuthRetry: true }),
};

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

const UNKNOWN = 'unknown';
const POST_SEND_MONEY_PATH = '/secured/sendmoney';
const REGISTER_MSISDN_PATH = '/secured/registry/msisdn';
const PUT_SEND_MONEY_PATH = /^\/secured\/sendmoney\/([^/?]+)$/;
const AUTHORIZATION_HEADER = 'authorization';

const REDACTED_FIELDS: ReadonlySet<string> = new Set([
    'accesskey',
    'accesstoken',
    'apikey',
    'authorization',
    'credential',
    'cvv',
    'cookie',
    'logobase64',
    'otp',
    'passcode',
    'password',
    'pin',
    'privatekey',
    'proxy-authorization',
    'refreshtoken',
    'secret',
    'set-cookie',
    'signature',
    'token',
]);

const REDACTED_HEADERS: ReadonlySet<string> = new Set([
    'accesskey',
    'accesstoken',
    'apikey',
    'cookie',
    'credential',
    'password',
    'privatekey',
    'proxyauthorization',
    'refreshtoken',
    'secret',
    'setcookie',
    'signature',
    'sslclientcert',
    'token',
    'xaccesstoken',
    'xapikey',
    'xauthtoken',
    'xclientcert',
    'xforwardedclientcert',
]);

export interface LoggableSendMoneyRequest {
    from?: {idValue?: string};
    to?: {idValue?: string};
}

interface LoggablePutSendMoneyRequest {
    acceptParty?: unknown;
    acceptQuote?: unknown;
}

const normalizeHeaderName = (name: string): string => {
    return name.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
};

const redactLogValue = (key: string, value: unknown): unknown => {
    if (REDACTED_FIELDS.has(key.toLowerCase())) {
        return '[redacted]';
    }

    return value;
};

/** Serializes a payload to one line while redacting credentials. */
export const stringifyForLog = (value: unknown): string => {
    if (value == null) {
        return '{}';
    }

    try {
        return JSON.stringify(value, redactLogValue) ?? '{}';
    } catch {
        return '[unserializable payload]';
    }
};

export const toSendMoneyIdentifiers = (body: unknown): string => {
    const request = (body ?? {}) as LoggableSendMoneyRequest;

    return `to.idValue ${request.to?.idValue ?? UNKNOWN}`
        + ` and from.idValue ${request.from?.idValue ?? UNKNOWN}`;
};

export const formatSendMoneyRequestLog = (body: unknown): string => {
    return `Post Send Money request for ${toSendMoneyIdentifiers(body)}`
        + `: ${stringifyForLog(body)}`;
};

const hasRequestBody = (body: unknown): boolean => {
    if (body == null) {
        return false;
    }

    if (typeof body !== 'object') {
        return true;
    }

    if (Array.isArray(body)) {
        return body.length > 0;
    }

    return Object.keys(body).length > 0;
};

/** Produces the route-specific request-body log for an inbound request. */
export const formatRequestBodyLog = (
    method: string,
    path: string,
    body: unknown,
): string | undefined => {
    const normalizedMethod = method.toUpperCase();
    const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;

    if (normalizedMethod === 'POST' && normalizedPath === POST_SEND_MONEY_PATH) {
        return formatSendMoneyRequestLog(body);
    }

    if (normalizedMethod === 'PUT') {
        const match = PUT_SEND_MONEY_PATH.exec(normalizedPath);

        if (match != null) {
            const transferId = match[1];
            const request = (body ?? {}) as LoggablePutSendMoneyRequest;

            if (request.acceptParty != null) {
                return `Put SendMoney Accept Party Request for TransferId ${transferId}`
                    + ` : ${stringifyForLog(body)}`;
            }

            if (request.acceptQuote != null) {
                return `Put SendMoney Accept Quote Request for TransferId ${transferId}`
                    + ` : ${stringifyForLog(body)}`;
            }

            return `Put SendMoney Request for TransferId ${transferId}`
                + ` : ${stringifyForLog(body)}`;
        }
    }

    if (normalizedMethod === 'POST' && normalizedPath === REGISTER_MSISDN_PATH) {
        return `Register MSISDN Request : ${stringifyForLog(body)}`;
    }

    if (!hasRequestBody(body)) {
        return undefined;
    }

    return `${normalizedMethod} ${normalizedPath} Request : ${stringifyForLog(body)}`;
};

const redactAuthorizationValue = (value: unknown): string => {
    if (typeof value === 'string' && /^Bearer(?:[ \t]+|$)/i.test(value.trim())) {
        return 'Bearer [redacted]';
    }

    return '[redacted]';
};

const redactAuthorization = (value: unknown): string | string[] => {
    if (Array.isArray(value)) {
        return value.map(redactAuthorizationValue);
    }

    return redactAuthorizationValue(value);
};

const sanitizeHeaders = (headers: unknown): Record<string, unknown> => {
    if (headers == null || typeof headers !== 'object' || Array.isArray(headers)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(headers).map(([name, value]) => {
            const normalizedName = normalizeHeaderName(name);

            if (normalizedName === AUTHORIZATION_HEADER) {
                return [name, redactAuthorization(value)];
            }

            if (REDACTED_HEADERS.has(normalizedName)) {
                return [name, '[redacted]'];
            }

            return [name, value];
        }),
    );
};

/** Produces a safe, single-line header log for an inbound request. */
export const formatRequestHeadersLog = (
    method: string,
    url: string,
    headers: unknown,
): string => {
    try {
        return `Request headers: ${JSON.stringify({
            method,
            url,
            headers: sanitizeHeaders(headers),
        })}`;
    } catch {
        return `Request headers: ${JSON.stringify({method, url, headers: '[unserializable headers]'})}`;
    }
};

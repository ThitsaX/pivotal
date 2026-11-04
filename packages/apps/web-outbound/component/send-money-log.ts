// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

/**
 * Shared formatting for the Post Send Money outbound audit log.
 *
 * The request lines (SendMoneyLogMiddleware) and the error-response line
 * (OutboundExceptionFilter) are built here so the pair always correlates on the same
 * identifiers and always renders as a single line. Authorization is intentionally
 * included only in the request-header line; credentials in bodies and error responses
 * remain redacted.
 */

const UNKNOWN = 'unknown';

/**
 * Replaced outright except for the Authorization request header, which the header audit
 * line intentionally includes. This also protects undeclared fields in the raw request
 * body, which is logged before the ValidationPipe has stripped anything.
 */
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

/**
 * Personal data that is not needed to investigate a failed transfer.
 *
 * Note that idValue and idSubValue are deliberately NOT masked: they are the correlation
 * keys the ticket requires in every line, and masking them would defeat the purpose of
 * the log. Flag that to ISMS as an accepted, documented exposure.
 */
const MASKED_FIELDS: ReadonlySet<string> = new Set([
    'dateofbirth',
    'displayname',
    'firstname',
    'lastname',
    'middlename',
]);

/** Minimal structural view of the request body - avoids depending on @core from the HTTP layer. */
export interface LoggableSendMoneyRequest {
    from?: { idValue?: string };
    to?: { idValue?: string };
}

/** Both OutboundValidationErrorResponse and OutboundErrorInformation satisfy this. */
export interface LoggableErrorResponse {
    statusCode?: string;
}

const redactLogValue = (key: string, value: unknown, includeAuthorization: boolean): unknown => {
    const normalizedKey = key.toLowerCase();

    if (REDACTED_FIELDS.has(normalizedKey)
        && !(includeAuthorization && normalizedKey === 'authorization')) {
        return '[redacted]';
    }

    if (MASKED_FIELDS.has(normalizedKey)) {
        return '[masked]';
    }

    return value;
};

/**
 * Serialises a payload to exactly one line.
 *
 * JSON.stringify without an indent argument emits no raw newlines - any newline inside a
 * string value is escaped to \n - so the result never splits a log entry in an aggregator.
 */
export const stringifyForLog = (value: unknown, includeAuthorization: boolean = false): string => {
    if (value == null) {
        return '{}';
    }

    try {
        return JSON.stringify(value, (key, nestedValue) => redactLogValue(key, nestedValue, includeAuthorization)) ?? '{}';
    } catch {
        return '[unserializable payload]';
    }
};

export const toSendMoneyIdentifiers = (body: unknown): string => {
    const request = (body ?? {}) as LoggableSendMoneyRequest;

    return `to.idValue ${request.to?.idValue ?? UNKNOWN} and from.idValue ${request.from?.idValue ?? UNKNOWN}`;
};

export const formatSendMoneyRequestLog = (body: unknown): string => {
    return `Post Send Money request for ${toSendMoneyIdentifiers(body)}: ${stringifyForLog(body)}`;
};

export const formatSendMoneyRequestHeadersLog = (body: unknown, headers: unknown): string => {
    return `Post Send Money request headers for ${toSendMoneyIdentifiers(body)}: ${stringifyForLog(headers, true)}`;
};

export const formatSendMoneyErrorResponseLog = (
    body: unknown,
    errorResponse: LoggableErrorResponse,
): string => {
    return `Post Send Money error response for ${toSendMoneyIdentifiers(body)}`
        + `: errorCode=${errorResponse?.statusCode ?? UNKNOWN} ${stringifyForLog(errorResponse)}`;
};

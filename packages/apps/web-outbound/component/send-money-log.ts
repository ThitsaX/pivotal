// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

/**
 * Shared formatting for the Post Send Money outbound audit log.
 *
 * The request line (SendMoneyLogInterceptor) and the error-response line
 * (OutboundExceptionFilter) are built here so the pair always correlates on the same
 * identifiers, always renders as a single line, and always applies the same redaction.
 */

const UNKNOWN = 'unknown';

/**
 * Replaced outright. Credentials and secrets have no forensic value and must never
 * reach the log, whether or not the DTO declares them - the raw request body is logged
 * before the ValidationPipe has stripped anything.
 */
const REDACTED_FIELDS: ReadonlySet<string> = new Set([
    'accesskey',
    'accesstoken',
    'apikey',
    'authorization',
    'credential',
    'cvv',
    'logobase64',
    'otp',
    'passcode',
    'password',
    'pin',
    'privatekey',
    'refreshtoken',
    'secret',
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

const redactLogValue = (key: string, value: unknown): unknown => {
    const normalizedKey = key.toLowerCase();

    if (REDACTED_FIELDS.has(normalizedKey)) {
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

    return `to.idValue ${request.to?.idValue ?? UNKNOWN} and from.idValue ${request.from?.idValue ?? UNKNOWN}`;
};

export const formatSendMoneyRequestLog = (body: unknown): string => {
    return `Post Send Money request for ${toSendMoneyIdentifiers(body)}: ${stringifyForLog(body)}`;
};

export const formatSendMoneyErrorResponseLog = (
    body: unknown,
    errorResponse: LoggableErrorResponse,
): string => {
    return `Post Send Money error response for ${toSendMoneyIdentifiers(body)}`
        + `: errorCode=${errorResponse?.statusCode ?? UNKNOWN} ${stringifyForLog(errorResponse)}`;
};

import { HttpStatus } from '@nestjs/common';
import { FspiopErrorType } from '../exception/fspiop-error-type';
import { FspiopException } from '../exception/fspiop-exception';

/**
 * Translates a FspiopException into an appropriate HTTP status code.
 *
 * Mapping rationale by error-code range:
 *
 *   1xxx  Communication errors  → 502 Bad Gateway         (upstream/peer unreachable)
 *   2xxx  Server errors         → 500 / 501 / 503 / 504   (our-side failures)
 *   30xx  Generic client        → 400 Bad Request
 *   3001  Bad API version       → 406 Not Acceptable
 *   3002  Unknown URI           → 404 Not Found
 *   31xx  Validation            → 400 Bad Request
 *   3104  Payload too large     → 413 Payload Too Large
 *   3105  Invalid signature     → 401 Unauthorized
 *   32xx  ID not found          → 404 Not Found
 *   3201  Destination FSP error → 422 Unprocessable Entity (FSP exists but rejected)
 *   33xx  Expired               → 408 Request Timeout
 *   43xx  Payer permission/blocked → 403 Forbidden
 *   4xxx  Payer business errors → 422 Unprocessable Entity
 *   53xx  Payee permission/blocked → 403 Forbidden
 *   5xxx  Payee business errors → 422 Unprocessable Entity
 */
export class FspiopStatusTranslator {

    private static readonly STATUS_MAP: Readonly<Record<string, HttpStatus>> = {
        // ── 1xxx  Communication ───────────────────────────────────────────────
        [FspiopErrorType.COMMUNICATION_ERROR.code]: HttpStatus.BAD_GATEWAY,
        [FspiopErrorType.DESTINATION_COMMUNICATION_ERROR.code]: HttpStatus.BAD_GATEWAY,

        // ── 2xxx  Server ──────────────────────────────────────────────────────
        [FspiopErrorType.GENERIC_SERVER_ERROR.code]: HttpStatus.INTERNAL_SERVER_ERROR,
        [FspiopErrorType.INTERNAL_SERVER_ERROR.code]: HttpStatus.INTERNAL_SERVER_ERROR,
        [FspiopErrorType.NOT_IMPLEMENTED.code]: HttpStatus.NOT_IMPLEMENTED,
        [FspiopErrorType.SERVICE_CURRENTLY_UNAVAILABLE.code]: HttpStatus.SERVICE_UNAVAILABLE,
        [FspiopErrorType.SERVER_TIMED_OUT.code]: HttpStatus.GATEWAY_TIMEOUT,
        [FspiopErrorType.SERVER_BUSY.code]: HttpStatus.SERVICE_UNAVAILABLE,

        // ── 30xx  Generic client ──────────────────────────────────────────────
        [FspiopErrorType.GENERIC_CLIENT_ERROR.code]: HttpStatus.BAD_REQUEST,
        [FspiopErrorType.UNACCEPTABLE_VERSION_REQUESTED.code]: HttpStatus.NOT_ACCEPTABLE,
        [FspiopErrorType.UNKNOWN_URI.code]: HttpStatus.NOT_FOUND,
        [FspiopErrorType.ADD_PARTY_INFORMATION_ERROR.code]: HttpStatus.UNPROCESSABLE_ENTITY,

        // ── 31xx  Validation ──────────────────────────────────────────────────
        [FspiopErrorType.GENERIC_VALIDATION_ERROR.code]: HttpStatus.BAD_REQUEST,
        [FspiopErrorType.MALFORMED_SYNTAX.code]: HttpStatus.BAD_REQUEST,
        [FspiopErrorType.MISSING_MANDATORY_ELEMENT.code]: HttpStatus.BAD_REQUEST,
        [FspiopErrorType.TOO_MANY_ELEMENTS.code]: HttpStatus.BAD_REQUEST,
        [FspiopErrorType.TOO_LARGE_PAYLOAD.code]: HttpStatus.PAYLOAD_TOO_LARGE,
        [FspiopErrorType.INVALID_SIGNATURE.code]: HttpStatus.UNAUTHORIZED,
        [FspiopErrorType.MODIFIED_REQUEST.code]: HttpStatus.BAD_REQUEST,
        [FspiopErrorType.MISSING_EXTENSION_PARAMETER.code]: HttpStatus.BAD_REQUEST,

        // ── 32xx  ID not found ────────────────────────────────────────────────
        [FspiopErrorType.GENERIC_ID_NOT_FOUND.code]: HttpStatus.NOT_FOUND,
        [FspiopErrorType.DESTINATION_FSP_ERROR.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYER_FSP_ID_NOT_FOUND.code]: HttpStatus.NOT_FOUND,
        [FspiopErrorType.PAYEE_FSP_ID_NOT_FOUND.code]: HttpStatus.NOT_FOUND,
        [FspiopErrorType.QUOTE_ID_NOT_FOUND.code]: HttpStatus.NOT_FOUND,
        [FspiopErrorType.TRANSACTION_REQUEST_ID_NOT_FOUND.code]: HttpStatus.NOT_FOUND,
        [FspiopErrorType.TRANSACTION_ID_NOT_FOUND.code]: HttpStatus.NOT_FOUND,
        [FspiopErrorType.TRANSFER_ID_NOT_FOUND.code]: HttpStatus.NOT_FOUND,
        [FspiopErrorType.BULK_QUOTE_ID_NOT_FOUND.code]: HttpStatus.NOT_FOUND,
        [FspiopErrorType.BULK_TRANSFER_ID_NOT_FOUND.code]: HttpStatus.NOT_FOUND,

        // ── 33xx  Expired ─────────────────────────────────────────────────────
        [FspiopErrorType.GENERIC_EXPIRED_ERROR.code]: HttpStatus.REQUEST_TIMEOUT,
        [FspiopErrorType.TRANSACTION_REQUEST_EXPIRED.code]: HttpStatus.REQUEST_TIMEOUT,
        [FspiopErrorType.QUOTE_EXPIRED.code]: HttpStatus.REQUEST_TIMEOUT,
        [FspiopErrorType.TRANSFER_EXPIRED.code]: HttpStatus.REQUEST_TIMEOUT,

        // ── 4xxx  Payer ───────────────────────────────────────────────────────
        [FspiopErrorType.GENERIC_PAYER_ERROR.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYER_FSP_INSUFFICIENT_LIQUIDITY.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.GENERIC_PAYER_REJECTION.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYER_REJECTED_TRANSACTION_REQUEST.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYER_FSP_UNSUPPORTED_TRANSACTION_TYPE.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYER_UNSUPPORTED_CURRENCY.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYER_LIMIT_ERROR.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYER_PERMISSION_ERROR.code]: HttpStatus.FORBIDDEN,
        [FspiopErrorType.GENERIC_PAYER_BLOCKED_ERROR.code]: HttpStatus.FORBIDDEN,
        [FspiopErrorType.ROUNDING_VALUE_ERROR.code]: HttpStatus.NOT_ACCEPTABLE,
        [FspiopErrorType.PARTY_NOT_FOUND.code]: HttpStatus.EXPECTATION_FAILED,

        // ── 5xxx  Payee ───────────────────────────────────────────────────────
        [FspiopErrorType.GENERIC_PAYEE_ERROR.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYEE_FSP_INSUFFICIENT_LIQUIDITY.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.GENERIC_PAYEE_REJECTION.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYEE_REJECTED_QUOTE.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYEE_FSP_UNSUPPORTED_TRANSACTION_TYPE.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYEE_FSP_REJECTED_QUOTE.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYEE_REJECTED_TRANSACTION.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYEE_FSP_REJECTED_TRANSACTION.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYEE_UNSUPPORTED_CURRENCY.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYEE_LIMIT_ERROR.code]: HttpStatus.UNPROCESSABLE_ENTITY,
        [FspiopErrorType.PAYEE_PERMISSION_ERROR.code]: HttpStatus.FORBIDDEN,
        [FspiopErrorType.GENERIC_PAYEE_BLOCKED_ERROR.code]: HttpStatus.FORBIDDEN,
    };

    private constructor() { }

    /**
     * Returns the HTTP status code that best represents the given FspiopException.
     * Falls back to 500 for any unrecognised error code.
     */
    static toHttpStatus(exception: FspiopException): HttpStatus {
        const code = exception.errorDefinition.errorType.code;
        return FspiopStatusTranslator.STATUS_MAP[code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    }
}

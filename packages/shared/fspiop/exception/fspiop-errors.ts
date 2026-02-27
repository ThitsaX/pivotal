import { ErrorDefinition } from './error-definition';
import { FspiopErrorType } from './fspiop-error-type';

export class FspiopErrors {

    static readonly COMMUNICATION_ERROR = new ErrorDefinition(FspiopErrorType.COMMUNICATION_ERROR, 'Generic communication error.');
    static readonly DESTINATION_COMMUNICATION_ERROR = new ErrorDefinition(FspiopErrorType.DESTINATION_COMMUNICATION_ERROR, 'Destination of the request failed to be reached. This usually indicates that a Peer FSP failed to respond from an intermediate entity.');
    static readonly GENERIC_SERVER_ERROR = new ErrorDefinition(FspiopErrorType.GENERIC_SERVER_ERROR, 'Used to avoid disclosing private details.');
    static readonly INTERNAL_SERVER_ERROR = new ErrorDefinition(FspiopErrorType.INTERNAL_SERVER_ERROR, 'Unexpected exception or bug.');
    static readonly NOT_IMPLEMENTED = new ErrorDefinition(FspiopErrorType.NOT_IMPLEMENTED, 'Service not supported by server.');
    static readonly SERVICE_CURRENTLY_UNAVAILABLE = new ErrorDefinition(FspiopErrorType.SERVICE_CURRENTLY_UNAVAILABLE, 'Service temporarily unavailable (e.g. maintenance).');
    static readonly SERVER_TIMED_OUT = new ErrorDefinition(FspiopErrorType.SERVER_TIMED_OUT, 'Callback not received within timeout period.');
    static readonly SERVER_BUSY = new ErrorDefinition(FspiopErrorType.SERVER_BUSY, 'Server rejecting requests due to overload.');
    static readonly GENERIC_CLIENT_ERROR = new ErrorDefinition(FspiopErrorType.GENERIC_CLIENT_ERROR, 'Used to avoid disclosing private client errors.');
    static readonly UNACCEPTABLE_VERSION_REQUESTED = new ErrorDefinition(FspiopErrorType.UNACCEPTABLE_VERSION_REQUESTED, 'Client requested unsupported API version.');
    static readonly UNKNOWN_URI = new ErrorDefinition(FspiopErrorType.UNKNOWN_URI, 'Provided URI not recognized by server.');
    static readonly ADD_PARTY_INFORMATION_ERROR = new ErrorDefinition(FspiopErrorType.ADD_PARTY_INFORMATION_ERROR, 'Error occurred while adding/updating party info.');
    static readonly GENERIC_VALIDATION_ERROR = new ErrorDefinition(FspiopErrorType.GENERIC_VALIDATION_ERROR, 'Generic format error.');
    static readonly MALFORMED_SYNTAX = new ErrorDefinition(FspiopErrorType.MALFORMED_SYNTAX, 'Invalid parameter format (e.g. amount \'5.ABC\').');
    static readonly MISSING_MANDATORY_ELEMENT = new ErrorDefinition(FspiopErrorType.MISSING_MANDATORY_ELEMENT, 'Required element in data model is missing.');
    static readonly TOO_MANY_ELEMENTS = new ErrorDefinition(FspiopErrorType.TOO_MANY_ELEMENTS, 'Array exceeds allowed maximum.');
    static readonly TOO_LARGE_PAYLOAD = new ErrorDefinition(FspiopErrorType.TOO_LARGE_PAYLOAD, 'Request payload exceeds allowed size.');
    static readonly INVALID_SIGNATURE = new ErrorDefinition(FspiopErrorType.INVALID_SIGNATURE, 'Payload signature invalid or modified.');
    static readonly MODIFIED_REQUEST = new ErrorDefinition(FspiopErrorType.MODIFIED_REQUEST, 'Parameters differ from a previously processed request.');
    static readonly MISSING_EXTENSION_PARAMETER = new ErrorDefinition(FspiopErrorType.MISSING_EXTENSION_PARAMETER, 'Required extension parameter not provided.');
    static readonly GENERIC_ID_NOT_FOUND = new ErrorDefinition(FspiopErrorType.GENERIC_ID_NOT_FOUND, 'Generic identifier error.');
    static readonly DESTINATION_FSP_ERROR = new ErrorDefinition(FspiopErrorType.DESTINATION_FSP_ERROR, 'Destination FSP cannot be found or doesn\'t exist.');
    static readonly PAYER_FSP_ID_NOT_FOUND = new ErrorDefinition(FspiopErrorType.PAYER_FSP_ID_NOT_FOUND, 'Payer FSP ID not recognized.');
    static readonly PAYEE_FSP_ID_NOT_FOUND = new ErrorDefinition(FspiopErrorType.PAYEE_FSP_ID_NOT_FOUND, 'Payee FSP ID not recognized.');
    static readonly PARTY_NOT_FOUND = new ErrorDefinition(FspiopErrorType.PARTY_NOT_FOUND, 'Provided party identifier not found.');
    static readonly QUOTE_ID_NOT_FOUND = new ErrorDefinition(FspiopErrorType.QUOTE_ID_NOT_FOUND, 'Quote ID not found on server.');
    static readonly TRANSACTION_REQUEST_ID_NOT_FOUND = new ErrorDefinition(FspiopErrorType.TRANSACTION_REQUEST_ID_NOT_FOUND, 'ID not found for transaction request.');
    static readonly TRANSACTION_ID_NOT_FOUND = new ErrorDefinition(FspiopErrorType.TRANSACTION_ID_NOT_FOUND, 'Transaction ID not found.');
    static readonly TRANSFER_ID_NOT_FOUND = new ErrorDefinition(FspiopErrorType.TRANSFER_ID_NOT_FOUND, 'Transfer ID not found.');
    static readonly BULK_QUOTE_ID_NOT_FOUND = new ErrorDefinition(FspiopErrorType.BULK_QUOTE_ID_NOT_FOUND, 'Bulk quote ID not found.');
    static readonly BULK_TRANSFER_ID_NOT_FOUND = new ErrorDefinition(FspiopErrorType.BULK_TRANSFER_ID_NOT_FOUND, 'Bulk transfer ID not found.');
    static readonly GENERIC_EXPIRED_ERROR = new ErrorDefinition(FspiopErrorType.GENERIC_EXPIRED_ERROR, 'Generic expired object error (non-specific).');
    static readonly TRANSACTION_REQUEST_EXPIRED = new ErrorDefinition(FspiopErrorType.TRANSACTION_REQUEST_EXPIRED, 'Transaction request has already expired.');
    static readonly QUOTE_EXPIRED = new ErrorDefinition(FspiopErrorType.QUOTE_EXPIRED, 'The quote is no longer valid.');
    static readonly TRANSFER_EXPIRED = new ErrorDefinition(FspiopErrorType.TRANSFER_EXPIRED, 'The transfer has already expired.');
    static readonly GENERIC_PAYER_ERROR = new ErrorDefinition(FspiopErrorType.GENERIC_PAYER_ERROR, 'Used for private payer-related errors.');
    static readonly PAYER_FSP_INSUFFICIENT_LIQUIDITY = new ErrorDefinition(FspiopErrorType.PAYER_FSP_INSUFFICIENT_LIQUIDITY, 'Payer-s FSP lacks funds.');
    static readonly GENERIC_PAYER_REJECTION = new ErrorDefinition(FspiopErrorType.GENERIC_PAYER_REJECTION, 'Payer or payer FSP rejected the request.');
    static readonly PAYER_REJECTED_TRANSACTION_REQUEST = new ErrorDefinition(FspiopErrorType.PAYER_REJECTED_TRANSACTION_REQUEST, 'Payer rejected the transaction request.');
    static readonly PAYER_FSP_UNSUPPORTED_TRANSACTION_TYPE = new ErrorDefinition(FspiopErrorType.PAYER_FSP_UNSUPPORTED_TRANSACTION_TYPE, 'Transaction type not supported by Payer FSP.');
    static readonly PAYER_UNSUPPORTED_CURRENCY = new ErrorDefinition(FspiopErrorType.PAYER_UNSUPPORTED_CURRENCY, 'Payer does not support requested currency.');
    static readonly PAYER_LIMIT_ERROR = new ErrorDefinition(FspiopErrorType.PAYER_LIMIT_ERROR, 'Payment amount/frequency exceeds limits.');
    static readonly PAYER_PERMISSION_ERROR = new ErrorDefinition(FspiopErrorType.PAYER_PERMISSION_ERROR, 'Payer lacks permission to perform operation.');
    static readonly GENERIC_PAYER_BLOCKED_ERROR = new ErrorDefinition(FspiopErrorType.GENERIC_PAYER_BLOCKED_ERROR, 'Payer is blocked or failed regulatory screening.');
    static readonly GENERIC_PAYEE_ERROR = new ErrorDefinition(FspiopErrorType.GENERIC_PAYEE_ERROR, 'Generic error related to payee or payee FSP.');
    static readonly PAYEE_FSP_INSUFFICIENT_LIQUIDITY = new ErrorDefinition(FspiopErrorType.PAYEE_FSP_INSUFFICIENT_LIQUIDITY, 'Payee FSP lacks sufficient liquidity.');
    static readonly GENERIC_PAYEE_REJECTION = new ErrorDefinition(FspiopErrorType.GENERIC_PAYEE_REJECTION, 'Payee or payee FSP rejected request.');
    static readonly PAYEE_REJECTED_QUOTE = new ErrorDefinition(FspiopErrorType.PAYEE_REJECTED_QUOTE, 'Payee unwilling to proceed after quote.');
    static readonly PAYEE_FSP_UNSUPPORTED_TRANSACTION_TYPE = new ErrorDefinition(FspiopErrorType.PAYEE_FSP_UNSUPPORTED_TRANSACTION_TYPE, 'Payee FSP rejects unsupported transaction type.');
    static readonly PAYEE_FSP_REJECTED_QUOTE = new ErrorDefinition(FspiopErrorType.PAYEE_FSP_REJECTED_QUOTE, 'Payee FSP unwilling to continue after quote.');
    static readonly PAYEE_REJECTED_TRANSACTION = new ErrorDefinition(FspiopErrorType.PAYEE_REJECTED_TRANSACTION, 'Payee rejected the transaction.');
    static readonly PAYEE_FSP_REJECTED_TRANSACTION = new ErrorDefinition(FspiopErrorType.PAYEE_FSP_REJECTED_TRANSACTION, 'Payee FSP rejected the transaction.');
    static readonly PAYEE_UNSUPPORTED_CURRENCY = new ErrorDefinition(FspiopErrorType.PAYEE_UNSUPPORTED_CURRENCY, 'Payee does not support requested currency.');
    static readonly PAYEE_LIMIT_ERROR = new ErrorDefinition(FspiopErrorType.PAYEE_LIMIT_ERROR, 'Receiving amount/frequency exceeds allowed limits.');
    static readonly PAYEE_PERMISSION_ERROR = new ErrorDefinition(FspiopErrorType.PAYEE_PERMISSION_ERROR, 'Payee lacks permission to perform operation.');
    static readonly GENERIC_PAYEE_BLOCKED_ERROR = new ErrorDefinition(FspiopErrorType.GENERIC_PAYEE_BLOCKED_ERROR, 'Payee is blocked or failed regulatory screening.');

    private static readonly ERROR_MAP: Readonly<Record<string, ErrorDefinition>> = {
        [FspiopErrors.COMMUNICATION_ERROR.errorType.code]: FspiopErrors.COMMUNICATION_ERROR,
        [FspiopErrors.DESTINATION_COMMUNICATION_ERROR.errorType.code]: FspiopErrors.DESTINATION_COMMUNICATION_ERROR,
        [FspiopErrors.GENERIC_SERVER_ERROR.errorType.code]: FspiopErrors.GENERIC_SERVER_ERROR,
        [FspiopErrors.INTERNAL_SERVER_ERROR.errorType.code]: FspiopErrors.INTERNAL_SERVER_ERROR,
        [FspiopErrors.NOT_IMPLEMENTED.errorType.code]: FspiopErrors.NOT_IMPLEMENTED,
        [FspiopErrors.SERVICE_CURRENTLY_UNAVAILABLE.errorType.code]: FspiopErrors.SERVICE_CURRENTLY_UNAVAILABLE,
        [FspiopErrors.SERVER_TIMED_OUT.errorType.code]: FspiopErrors.SERVER_TIMED_OUT,
        [FspiopErrors.SERVER_BUSY.errorType.code]: FspiopErrors.SERVER_BUSY,
        [FspiopErrors.GENERIC_CLIENT_ERROR.errorType.code]: FspiopErrors.GENERIC_CLIENT_ERROR,
        [FspiopErrors.UNACCEPTABLE_VERSION_REQUESTED.errorType.code]: FspiopErrors.UNACCEPTABLE_VERSION_REQUESTED,
        [FspiopErrors.UNKNOWN_URI.errorType.code]: FspiopErrors.UNKNOWN_URI,
        [FspiopErrors.ADD_PARTY_INFORMATION_ERROR.errorType.code]: FspiopErrors.ADD_PARTY_INFORMATION_ERROR,
        [FspiopErrors.GENERIC_VALIDATION_ERROR.errorType.code]: FspiopErrors.GENERIC_VALIDATION_ERROR,
        [FspiopErrors.MALFORMED_SYNTAX.errorType.code]: FspiopErrors.MALFORMED_SYNTAX,
        [FspiopErrors.MISSING_MANDATORY_ELEMENT.errorType.code]: FspiopErrors.MISSING_MANDATORY_ELEMENT,
        [FspiopErrors.TOO_MANY_ELEMENTS.errorType.code]: FspiopErrors.TOO_MANY_ELEMENTS,
        [FspiopErrors.TOO_LARGE_PAYLOAD.errorType.code]: FspiopErrors.TOO_LARGE_PAYLOAD,
        [FspiopErrors.INVALID_SIGNATURE.errorType.code]: FspiopErrors.INVALID_SIGNATURE,
        [FspiopErrors.MODIFIED_REQUEST.errorType.code]: FspiopErrors.MODIFIED_REQUEST,
        [FspiopErrors.MISSING_EXTENSION_PARAMETER.errorType.code]: FspiopErrors.MISSING_EXTENSION_PARAMETER,
        [FspiopErrors.GENERIC_ID_NOT_FOUND.errorType.code]: FspiopErrors.GENERIC_ID_NOT_FOUND,
        [FspiopErrors.DESTINATION_FSP_ERROR.errorType.code]: FspiopErrors.DESTINATION_FSP_ERROR,
        [FspiopErrors.PAYER_FSP_ID_NOT_FOUND.errorType.code]: FspiopErrors.PAYER_FSP_ID_NOT_FOUND,
        [FspiopErrors.PAYEE_FSP_ID_NOT_FOUND.errorType.code]: FspiopErrors.PAYEE_FSP_ID_NOT_FOUND,
        [FspiopErrors.PARTY_NOT_FOUND.errorType.code]: FspiopErrors.PARTY_NOT_FOUND,
        [FspiopErrors.QUOTE_ID_NOT_FOUND.errorType.code]: FspiopErrors.QUOTE_ID_NOT_FOUND,
        [FspiopErrors.TRANSACTION_REQUEST_ID_NOT_FOUND.errorType.code]: FspiopErrors.TRANSACTION_REQUEST_ID_NOT_FOUND,
        [FspiopErrors.TRANSACTION_ID_NOT_FOUND.errorType.code]: FspiopErrors.TRANSACTION_ID_NOT_FOUND,
        [FspiopErrors.TRANSFER_ID_NOT_FOUND.errorType.code]: FspiopErrors.TRANSFER_ID_NOT_FOUND,
        [FspiopErrors.BULK_QUOTE_ID_NOT_FOUND.errorType.code]: FspiopErrors.BULK_QUOTE_ID_NOT_FOUND,
        [FspiopErrors.BULK_TRANSFER_ID_NOT_FOUND.errorType.code]: FspiopErrors.BULK_TRANSFER_ID_NOT_FOUND,
        [FspiopErrors.GENERIC_EXPIRED_ERROR.errorType.code]: FspiopErrors.GENERIC_EXPIRED_ERROR,
        [FspiopErrors.TRANSACTION_REQUEST_EXPIRED.errorType.code]: FspiopErrors.TRANSACTION_REQUEST_EXPIRED,
        [FspiopErrors.QUOTE_EXPIRED.errorType.code]: FspiopErrors.QUOTE_EXPIRED,
        [FspiopErrors.TRANSFER_EXPIRED.errorType.code]: FspiopErrors.TRANSFER_EXPIRED,
        [FspiopErrors.GENERIC_PAYER_ERROR.errorType.code]: FspiopErrors.GENERIC_PAYER_ERROR,
        [FspiopErrors.PAYER_FSP_INSUFFICIENT_LIQUIDITY.errorType.code]: FspiopErrors.PAYER_FSP_INSUFFICIENT_LIQUIDITY,
        [FspiopErrors.GENERIC_PAYER_REJECTION.errorType.code]: FspiopErrors.GENERIC_PAYER_REJECTION,
        [FspiopErrors.PAYER_REJECTED_TRANSACTION_REQUEST.errorType.code]: FspiopErrors.PAYER_REJECTED_TRANSACTION_REQUEST,
        [FspiopErrors.PAYER_FSP_UNSUPPORTED_TRANSACTION_TYPE.errorType.code]: FspiopErrors.PAYER_FSP_UNSUPPORTED_TRANSACTION_TYPE,
        [FspiopErrors.PAYER_UNSUPPORTED_CURRENCY.errorType.code]: FspiopErrors.PAYER_UNSUPPORTED_CURRENCY,
        [FspiopErrors.PAYER_LIMIT_ERROR.errorType.code]: FspiopErrors.PAYER_LIMIT_ERROR,
        [FspiopErrors.PAYER_PERMISSION_ERROR.errorType.code]: FspiopErrors.PAYER_PERMISSION_ERROR,
        [FspiopErrors.GENERIC_PAYER_BLOCKED_ERROR.errorType.code]: FspiopErrors.GENERIC_PAYER_BLOCKED_ERROR,
        [FspiopErrors.GENERIC_PAYEE_ERROR.errorType.code]: FspiopErrors.GENERIC_PAYEE_ERROR,
        [FspiopErrors.PAYEE_FSP_INSUFFICIENT_LIQUIDITY.errorType.code]: FspiopErrors.PAYEE_FSP_INSUFFICIENT_LIQUIDITY,
        [FspiopErrors.GENERIC_PAYEE_REJECTION.errorType.code]: FspiopErrors.GENERIC_PAYEE_REJECTION,
        [FspiopErrors.PAYEE_REJECTED_QUOTE.errorType.code]: FspiopErrors.PAYEE_REJECTED_QUOTE,
        [FspiopErrors.PAYEE_FSP_UNSUPPORTED_TRANSACTION_TYPE.errorType.code]: FspiopErrors.PAYEE_FSP_UNSUPPORTED_TRANSACTION_TYPE,
        [FspiopErrors.PAYEE_FSP_REJECTED_QUOTE.errorType.code]: FspiopErrors.PAYEE_FSP_REJECTED_QUOTE,
        [FspiopErrors.PAYEE_REJECTED_TRANSACTION.errorType.code]: FspiopErrors.PAYEE_REJECTED_TRANSACTION,
        [FspiopErrors.PAYEE_FSP_REJECTED_TRANSACTION.errorType.code]: FspiopErrors.PAYEE_FSP_REJECTED_TRANSACTION,
        [FspiopErrors.PAYEE_UNSUPPORTED_CURRENCY.errorType.code]: FspiopErrors.PAYEE_UNSUPPORTED_CURRENCY,
        [FspiopErrors.PAYEE_LIMIT_ERROR.errorType.code]: FspiopErrors.PAYEE_LIMIT_ERROR,
        [FspiopErrors.PAYEE_PERMISSION_ERROR.errorType.code]: FspiopErrors.PAYEE_PERMISSION_ERROR,
        [FspiopErrors.GENERIC_PAYEE_BLOCKED_ERROR.errorType.code]: FspiopErrors.GENERIC_PAYEE_BLOCKED_ERROR,
    };

    static find(code: string): ErrorDefinition | undefined {
        return FspiopErrors.ERROR_MAP[code];
    }
}

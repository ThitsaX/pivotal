export class FspiopErrorType {

    private static readonly VALUES: FspiopErrorType[] = [];

    static readonly COMMUNICATION_ERROR = new FspiopErrorType('1000', 'Communication error');
    static readonly DESTINATION_COMMUNICATION_ERROR = new FspiopErrorType('1001', 'Destination communication error');
    static readonly GENERIC_SERVER_ERROR = new FspiopErrorType('2000', 'Generic server error');
    static readonly INTERNAL_SERVER_ERROR = new FspiopErrorType('2001', 'Internal server error');
    static readonly NOT_IMPLEMENTED = new FspiopErrorType('2002', 'Not implemented');
    static readonly SERVICE_CURRENTLY_UNAVAILABLE = new FspiopErrorType('2003', 'Service currently unavailable');
    static readonly SERVER_TIMED_OUT = new FspiopErrorType('2004', 'Server timed out');
    static readonly SERVER_BUSY = new FspiopErrorType('2005', 'Server busy');
    static readonly GENERIC_CLIENT_ERROR = new FspiopErrorType('3000', 'Generic client error');
    static readonly UNACCEPTABLE_VERSION_REQUESTED = new FspiopErrorType('3001', 'Unacceptable version requested');
    static readonly UNKNOWN_URI = new FspiopErrorType('3002', 'Unknown URI');
    static readonly ADD_PARTY_INFORMATION_ERROR = new FspiopErrorType('3003', 'Add Party information error');
    static readonly GENERIC_VALIDATION_ERROR = new FspiopErrorType('3100', 'Generic validation error');
    static readonly MALFORMED_SYNTAX = new FspiopErrorType('3101', 'Malformed syntax');
    static readonly MISSING_MANDATORY_ELEMENT = new FspiopErrorType('3102', 'Missing mandatory element');
    static readonly TOO_MANY_ELEMENTS = new FspiopErrorType('3103', 'Too many elements');
    static readonly TOO_LARGE_PAYLOAD = new FspiopErrorType('3104', 'Too large payload');
    static readonly INVALID_SIGNATURE = new FspiopErrorType('3105', 'Invalid signature');
    static readonly MODIFIED_REQUEST = new FspiopErrorType('3106', 'Modified request');
    static readonly MISSING_EXTENSION_PARAMETER = new FspiopErrorType('3107', 'Missing extension parameter');
    static readonly GENERIC_ID_NOT_FOUND = new FspiopErrorType('3200', 'Generic ID not found');
    static readonly DESTINATION_FSP_ERROR = new FspiopErrorType('3201', 'Destination FSP Error');
    static readonly PAYER_FSP_ID_NOT_FOUND = new FspiopErrorType('3202', 'Payer FSP ID not found');
    static readonly PAYEE_FSP_ID_NOT_FOUND = new FspiopErrorType('3203', 'Payee FSP ID not found');
    static readonly PARTY_NOT_FOUND = new FspiopErrorType('3204', 'Party not found');
    static readonly QUOTE_ID_NOT_FOUND = new FspiopErrorType('3205', 'Quote ID not found');
    static readonly TRANSACTION_REQUEST_ID_NOT_FOUND = new FspiopErrorType('3206', 'Transaction request ID not found');
    static readonly TRANSACTION_ID_NOT_FOUND = new FspiopErrorType('3207', 'Transaction ID not found');
    static readonly TRANSFER_ID_NOT_FOUND = new FspiopErrorType('3208', 'Transfer ID not found');
    static readonly BULK_QUOTE_ID_NOT_FOUND = new FspiopErrorType('3209', 'Bulk quote ID not found');
    static readonly BULK_TRANSFER_ID_NOT_FOUND = new FspiopErrorType('3210', 'Bulk transfer ID not found');
    static readonly GENERIC_EXPIRED_ERROR = new FspiopErrorType('3300', 'Generic expired error');
    static readonly TRANSACTION_REQUEST_EXPIRED = new FspiopErrorType('3301', 'Transaction request expired');
    static readonly QUOTE_EXPIRED = new FspiopErrorType('3302', 'Quote expired');
    static readonly TRANSFER_EXPIRED = new FspiopErrorType('3303', 'Transfer expired');
    static readonly GENERIC_PAYER_ERROR = new FspiopErrorType('4000', 'Generic Payer error');
    static readonly PAYER_FSP_INSUFFICIENT_LIQUIDITY = new FspiopErrorType('4001', 'Payer FSP insufficient liquidity');
    static readonly GENERIC_PAYER_REJECTION = new FspiopErrorType('4100', 'Generic Payer rejection');
    static readonly PAYER_REJECTED_TRANSACTION_REQUEST = new FspiopErrorType('4101', 'Payer rejected transaction request');
    static readonly PAYER_FSP_UNSUPPORTED_TRANSACTION_TYPE = new FspiopErrorType('4102', 'Payer FSP unsupported transaction type');
    static readonly PAYER_UNSUPPORTED_CURRENCY = new FspiopErrorType('4103', 'Payer unsupported currency');
    static readonly PAYER_LIMIT_ERROR = new FspiopErrorType('4200', 'Payer limit error');
    static readonly PAYER_PERMISSION_ERROR = new FspiopErrorType('4300', 'Payer permission error');
    static readonly GENERIC_PAYER_BLOCKED_ERROR = new FspiopErrorType('4400', 'Generic Payer blocked error');
    static readonly GENERIC_PAYEE_ERROR = new FspiopErrorType('5000', 'Generic Payee error');
    static readonly PAYEE_FSP_INSUFFICIENT_LIQUIDITY = new FspiopErrorType('5001', 'Payee FSP insufficient liquidity');
    static readonly GENERIC_PAYEE_REJECTION = new FspiopErrorType('5100', 'Generic Payee rejection');
    static readonly PAYEE_REJECTED_QUOTE = new FspiopErrorType('5101', 'Payee rejected quote');
    static readonly PAYEE_FSP_UNSUPPORTED_TRANSACTION_TYPE = new FspiopErrorType('5102', 'Payee FSP unsupported transaction type');
    static readonly PAYEE_FSP_REJECTED_QUOTE = new FspiopErrorType('5103', 'Payee FSP rejected quote');
    static readonly PAYEE_REJECTED_TRANSACTION = new FspiopErrorType('5104', 'Payee rejected transaction');
    static readonly PAYEE_FSP_REJECTED_TRANSACTION = new FspiopErrorType('5105', 'Payee FSP rejected transaction');
    static readonly PAYEE_UNSUPPORTED_CURRENCY = new FspiopErrorType('5106', 'Payee unsupported currency');
    static readonly PAYEE_LIMIT_ERROR = new FspiopErrorType('5200', 'Payee limit error');
    static readonly PAYEE_PERMISSION_ERROR = new FspiopErrorType('5300', 'Payee permission error');
    static readonly ROUNDING_VALUE_ERROR = new FspiopErrorType('5241', "Amount is invalid. Please enter the format specified by the service provider.");
    static readonly GENERIC_PAYEE_BLOCKED_ERROR = new FspiopErrorType('5400', 'Generic Payee blocked error');
    static readonly INACTIVE_ACCOUNT = new FspiopErrorType('3242', 'Account is not active.');

    readonly code: string;

    readonly name: string;

    private constructor(code: string, name: string) {
        this.code = code;
        this.name = name;

        FspiopErrorType.VALUES.push(this);
    }

    static fromCode(code: string): FspiopErrorType {
        const errorType = FspiopErrorType.VALUES.find((value) => value.code === code);

        if (errorType == null) {
            throw new Error(`Unknown FSPIOP error code: ${code}`);
        }

        return errorType;
    }

    static values(): ReadonlyArray<FspiopErrorType> {
        return FspiopErrorType.VALUES;
    }
}

import {
    ErrorInformationObject,
    ErrorInformationResponse,
    FspiopException,
} from '@shared/fspiop';
import {FspClientException} from '../exception';

export class AuditErrorConverter {

    static toAuditError(error: unknown): ErrorInformationObject {
        try {
            FspiopException.rethrow(error);
        } catch (normalizedError) {
            return (normalizedError as FspiopException).toErrorObject();
        }
    }

    static toErrorResponse(error: ErrorInformationObject): ErrorInformationResponse {
        return {errorInformation: error.errorInformation};
    }

    static toFspError(error: unknown): string | null {
        if (!(error instanceof FspClientException)) {
            return null;
        }

        return error.message.trim().length > 0
            ? error.message
            : error.description;
    }
}

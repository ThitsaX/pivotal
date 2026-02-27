import { ErrorInformationObject } from '../dto/error-information-object';
import { ErrorDefinition } from './error-definition';

export class FspiopException extends Error {

    readonly errorDefinition: ErrorDefinition;

    readonly originalError?: Error;

    constructor(errorDefinition: ErrorDefinition);
    constructor(errorDefinition: ErrorDefinition, message: string);
    constructor(errorDefinition: ErrorDefinition, error: Error);
    constructor(errorDefinition: ErrorDefinition, messageOrError?: string | Error) {
        const message = typeof messageOrError === 'string'
            ? messageOrError
            : messageOrError instanceof Error
                ? messageOrError.message
                : errorDefinition.description;

        super(message);

        this.name = 'FspiopException';

        this.errorDefinition = typeof messageOrError === 'string'
            ? new ErrorDefinition(errorDefinition.errorType, messageOrError)
            : errorDefinition;

        if (messageOrError instanceof Error) {
            this.originalError = messageOrError;
        }

        Object.setPrototypeOf(this, new.target.prototype);
    }

    toErrorObject(): ErrorInformationObject {
        return this.errorDefinition.toErrorObject();
    }
}

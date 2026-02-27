import { ErrorDefinition } from './error-definition';
import { FspiopException } from './fspiop-exception';

export class FspiopCommunicationException extends FspiopException {

    constructor(errorDefinition: ErrorDefinition);
    constructor(errorDefinition: ErrorDefinition, message: string);
    constructor(errorDefinition: ErrorDefinition, error: Error);
    constructor(errorDefinition: ErrorDefinition, messageOrError?: string | Error) {
        if (messageOrError == null) {
            super(errorDefinition);
        } else if (typeof messageOrError === 'string') {
            super(errorDefinition, messageOrError);
        } else {
            super(errorDefinition, messageOrError);
        }

        this.name = 'FspiopCommunicationException';
    }
}

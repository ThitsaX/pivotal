import { ErrorInformationObject } from '../dto/error-information-object';
import { ExtensionList } from '../dto/extension-list';
import { ErrorDefinition } from './error-definition';

export class FspiopException extends Error {

    readonly errorDefinition: ErrorDefinition;

    readonly extensionList?: ExtensionList;

    readonly originalError?: Error;

    constructor(errorDefinition: ErrorDefinition);
    constructor(errorDefinition: ErrorDefinition, extensionList?: ExtensionList);
    constructor(errorDefinition: ErrorDefinition, message: string, extensionList?: ExtensionList);
    constructor(errorDefinition: ErrorDefinition, error: Error, extensionList?: ExtensionList);
    constructor(errorDefinition: ErrorDefinition, messageOrError?: string | Error | ExtensionList, extensionListArg?: ExtensionList) {
        const message = typeof messageOrError === 'string'
            ? messageOrError
            : messageOrError instanceof Error
                ? messageOrError.message
                : errorDefinition.description;

        const isMessageOrError = typeof messageOrError === 'string' || messageOrError instanceof Error;
        const extensionList = isMessageOrError
            ? extensionListArg
            : messageOrError;

        super(message);

        this.name = 'FspiopException';

        this.errorDefinition = typeof messageOrError === 'string'
            ? new ErrorDefinition(errorDefinition.errorType, messageOrError)
            : errorDefinition;

        this.extensionList = extensionList;

        if (messageOrError instanceof Error) {
            this.originalError = messageOrError;
        }

        Object.setPrototypeOf(this, new.target.prototype);
    }

    toErrorObject(): ErrorInformationObject {
        return this.errorDefinition.toErrorObject(this.extensionList);
    }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import { ErrorInformationObject } from '../dto/error-information-object';
import { ExtensionList } from '../dto/extension-list';
import { ErrorDefinition } from './error-definition';
import { FspiopErrors } from './fspiop-errors';

export class FspiopException extends Error {

    readonly errorDefinition: ErrorDefinition;

    readonly extensionList?: ExtensionList;

    readonly originalError?: Error;

    constructor(errorDefinition: ErrorDefinition);
    constructor(errorDefinition: ErrorDefinition, extensionList?: ExtensionList);
    constructor(errorDefinition: ErrorDefinition, message: string, extensionList?: ExtensionList);
    constructor(errorDefinition: ErrorDefinition, error: Error, extensionList?: ExtensionList);
    constructor(errorDefinition: ErrorDefinition, messageOrError?: string | Error | ExtensionList, extensionListArg?: ExtensionList) {
        const rawMessage = typeof messageOrError === 'string'
            ? messageOrError
            : messageOrError instanceof Error
                ? messageOrError.message
                : errorDefinition.description;
        const message = FspiopException.firstNonBlank(rawMessage, errorDefinition.description);

        const isMessageOrError = typeof messageOrError === 'string' || messageOrError instanceof Error;
        const extensionList = isMessageOrError
            ? extensionListArg
            : messageOrError;

        super(message);

        this.name = 'FspiopException';

        this.errorDefinition = typeof messageOrError === 'string'
            ? new ErrorDefinition(errorDefinition.errorType, message)
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

    static rethrow(exception: unknown): never {
        throw FspiopException.normalize(exception);
    }

    static normalize(exception: unknown): FspiopException {
        if (exception instanceof FspiopException) {
            return exception;
        }

        const message = FspiopException.firstNonBlank(
            exception instanceof Error ? exception.message : undefined,
            FspiopErrors.INTERNAL_SERVER_ERROR.description,
        );

        return new FspiopException(FspiopErrors.INTERNAL_SERVER_ERROR, message);
    }

    private static firstNonBlank(value: string | undefined, fallback: string): string {
        return value != null && value.trim().length > 0
            ? value
            : fallback;
    }
}

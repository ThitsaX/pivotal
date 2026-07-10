// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { ExtensionList } from '../dto/extension-list';
import { ErrorDefinition } from './error-definition';
import { FspiopException } from './fspiop-exception';

export class FspiopCommunicationException extends FspiopException {

    constructor(errorDefinition: ErrorDefinition);
    constructor(errorDefinition: ErrorDefinition, extensionList?: ExtensionList);
    constructor(errorDefinition: ErrorDefinition, message: string, extensionList?: ExtensionList);
    constructor(errorDefinition: ErrorDefinition, error: Error, extensionList?: ExtensionList);
    constructor(errorDefinition: ErrorDefinition, messageOrError?: string | Error | ExtensionList, extensionListArg?: ExtensionList) {
        if (messageOrError == null || !FspiopCommunicationException.isMessageOrError(messageOrError)) {
            const extensionList = messageOrError == null ? undefined : messageOrError;
            super(errorDefinition, extensionList);
        } else if (typeof messageOrError === 'string') {
            super(errorDefinition, messageOrError, extensionListArg);
        } else {
            super(errorDefinition, messageOrError, extensionListArg);
        }

        this.name = 'FspiopCommunicationException';
    }

    private static isMessageOrError(value: string | Error | ExtensionList): value is string | Error {
        if (typeof value === 'string') {
            return true;
        }

        if (value instanceof Error) {
            return true;
        }

        return false;
    }
}

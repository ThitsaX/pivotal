// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { ErrorInformationObject } from '@shared/fspiop';
import { FspiopErrorType } from '@shared/fspiop';
import { ExtensionList } from '../dto/extension-list';

export class ErrorDefinition {

    readonly errorType: FspiopErrorType;

    readonly description: string;

    constructor(errorType: FspiopErrorType, description: string) {
        this.errorType = errorType;
        this.description = description;
    }

    toErrorObject(extensionList?: ExtensionList): ErrorInformationObject {

        const errorInformation = {
            errorCode: this.errorType.code,
            errorDescription: this.description,
        };

        if (extensionList != null) {
            return {
                errorInformation: {
                    ...errorInformation,
                    extensionList,
                },
            };
        }

        return {
            errorInformation,
        };
    }
}

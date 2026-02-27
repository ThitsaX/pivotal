import { ErrorInformationObject } from '@shared/fspiop';
import { FspiopErrorType } from '@shared/fspiop';

export class ErrorDefinition {

    readonly errorType: FspiopErrorType;

    readonly description: string;

    constructor(errorType: FspiopErrorType, description: string) {
        this.errorType = errorType;
        this.description = description;
    }

    toErrorObject(): ErrorInformationObject {
        return {
            errorInformation: {
                errorCode: this.errorType.code,
                errorDescription: this.description,
            },
        };
    }
}

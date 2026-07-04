// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export class FspClientException extends Error {

    readonly code: string;
    readonly description: string;

    constructor(description: string);

    constructor(code: string, description: string);

    constructor(codeOrDescription: string, descriptionArg?: string) {
        const code = descriptionArg == null ? 'FSP_CLIENT_ERROR' : codeOrDescription;
        const description = descriptionArg == null ? codeOrDescription : descriptionArg;

        super(description);

        this.code = code;
        this.description = description;
        this.name = 'FspClientException';

        Object.setPrototypeOf(this, new.target.prototype);
    }

    static normalize(exception: unknown): FspClientException {
        if (exception instanceof FspClientException) {
            return exception;
        }

        const description = exception instanceof Error && exception.message.trim().length > 0
            ? exception.message
            : 'Unexpected FSP client error.';

        return new FspClientException('INTERNAL_SERVER_ERROR', description);
    }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class PivotalException extends Error {

    readonly code: string;
    readonly description: string;

    constructor(code: string, description: string) {
        super(description);

        this.code = code;
        this.description = description;
        this.name = 'PivotalException';

        Object.setPrototypeOf(this, new.target.prototype);
    }

    static normalize(exception: unknown): PivotalException {
        if (exception instanceof PivotalException) {
            return exception;
        }

        const message = exception instanceof Error && exception.message.trim().length > 0
            ? exception.message
            : 'Unexpected internal error.';

        return new PivotalException('INTERNAL_SERVER_ERROR', message);
    }
}

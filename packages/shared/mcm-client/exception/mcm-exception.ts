// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class McmException extends Error {

    readonly code: string;
    readonly description: string;

    /**
     * The HTTP status MCM answered with, when it answered at all.
     *
     * Undefined for a request that never got a response — a refused connection, a timeout, a DNS
     * failure. That distinction is the point of keeping it: a caller retrying on failure needs to
     * know whether MCM said no, or never said anything. The status appears in the message too, but
     * a caller should not have to parse prose to decide whether to try again.
     */
    readonly status: number | undefined;

    constructor(description: string);

    constructor(code: string, description: string, status?: number);

    constructor(codeOrDescription: string, descriptionArg?: string, status?: number) {
        const code = descriptionArg == null ? 'MCM_ERROR' : codeOrDescription;
        const description = descriptionArg == null ? codeOrDescription : descriptionArg;

        super(description);

        this.code = code;
        this.description = description;
        this.status = status;
        this.name = 'McmException';

        Object.setPrototypeOf(this, new.target.prototype);
    }
}

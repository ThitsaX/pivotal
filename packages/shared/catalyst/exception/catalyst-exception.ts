// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export class CatalystException extends Error {

    readonly code: string;

    constructor(message: string);

    constructor(code: string, message: string);

    constructor(codeOrMessage: string, messageArg?: string) {
        const code = messageArg == null ? 'CATALYST_ERROR' : codeOrMessage;
        const message = messageArg == null ? codeOrMessage : messageArg;

        super(message);

        this.code = code;
        this.name = 'CatalystException';

        Object.setPrototypeOf(this, new.target.prototype);
    }
}

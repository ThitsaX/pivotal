// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class CentralLedgerException extends Error {

    readonly code: string;
    readonly description: string;

    constructor(description: string);

    constructor(code: string, description: string);

    constructor(codeOrDescription: string, descriptionArg?: string) {
        const code = descriptionArg == null ? 'CENTRAL_LEDGER_ERROR' : codeOrDescription;
        const description = descriptionArg == null ? codeOrDescription : descriptionArg;

        super(description);

        this.code = code;
        this.description = description;
        this.name = 'CentralLedgerException';

        Object.setPrototypeOf(this, new.target.prototype);
    }
}

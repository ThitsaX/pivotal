export class CentralLedgerException extends Error {

    readonly code: string;

    constructor(message: string);

    constructor(code: string, message: string);

    constructor(codeOrMessage: string, messageArg?: string) {
        const code = messageArg == null ? 'CENTRAL_LEDGER_ERROR' : codeOrMessage;
        const message = messageArg == null ? codeOrMessage : messageArg;

        super(message);

        this.code = code;
        this.name = 'CentralLedgerException';

        Object.setPrototypeOf(this, new.target.prototype);
    }
}

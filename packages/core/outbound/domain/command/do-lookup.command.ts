import {PartiesTypeIDPutResponse, Party, PartyIdType} from '@shared/fspiop';

export class DoLookupCommand {
    constructor(public readonly input: DoLookupCommand.Input) {
    }
}

export namespace DoLookupCommand {

    export class Request {
        constructor(
            public readonly destination: string,
            public readonly type: PartyIdType,
            public readonly id: string,
            public readonly subId?: string,
        ) {
        }
    }

    export class Input {
        constructor(
            public readonly source: string,
            public readonly request: DoLookupCommand.Request,
        ) {
        }

        get destination(): string {
            return this.request.destination;
        }

        get type(): PartyIdType {
            return this.request.type;
        }

        get id(): string {
            return this.request.id;
        }

        get subId(): string | undefined {
            return this.request.subId;
        }

        get auditSubId(): string | null {
            return this.request.subId ?? null;
        }
    }

    export class Response {
        constructor(public readonly payee: Party) {
        }
    }

    /**
     * Resolved once the PUT /parties callback arrives on the success subject
     * via PartiesResponseSubscriber.
     * Throws FspiopException if the error callback arrives instead, or on timeout.
     */
    export class Output {
        constructor(
            public readonly response: DoLookupCommand.Response,
            public readonly callback: PartiesTypeIDPutResponse,
        ) {
        }

        static fromCallback(callback: PartiesTypeIDPutResponse): DoLookupCommand.Output {
            return new DoLookupCommand.Output(
                new DoLookupCommand.Response(callback.party),
                callback,
            );
        }
    }
}

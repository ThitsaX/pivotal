import {QuotesIDPutResponse} from '@shared/fspiop';
import {SendMoneyResponse} from '../dto';

export class PutAcceptPartyCommand {
    constructor(public readonly input: PutAcceptPartyCommand.Input) {
    }
}

export namespace PutAcceptPartyCommand {

    export class Input {
        constructor(
            public readonly transferId: string,
            public readonly acceptParty: boolean,
            public readonly amount: string,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly response: SendMoneyResponse,
            public readonly callback: QuotesIDPutResponse,
        ) {
        }
    }
}

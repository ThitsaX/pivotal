import {TransfersIDPutResponse} from '@shared/fspiop';
import {SendMoneyResponse} from '../dto';

export class PutAcceptQuoteCommand {
    constructor(public readonly input: PutAcceptQuoteCommand.Input) {
    }
}

export namespace PutAcceptQuoteCommand {

    export class Input {
        constructor(
            public readonly transferId: string,
            public readonly acceptQuote: boolean,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly response: SendMoneyResponse,
            public readonly callback: TransfersIDPutResponse,
        ) {
        }
    }
}

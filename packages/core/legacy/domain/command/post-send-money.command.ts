import {PartiesTypeIDPutResponse} from '@shared/fspiop';
import {SendMoneyRequest, SendMoneyResponse} from '../dto';

export class PostSendMoneyCommand {
    constructor(public readonly input: PostSendMoneyCommand.Input) {
    }
}

export namespace PostSendMoneyCommand {

    export class Input {
        constructor(
            public readonly source: string,
            public readonly request: SendMoneyRequest,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly response: SendMoneyResponse,
            public readonly callback: PartiesTypeIDPutResponse,
        ) {
        }
    }
}

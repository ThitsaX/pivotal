import {PartiesTypeIDPutResponse} from '@shared/fspiop';

export class CompleteInboundPartiesCommand {
    constructor(public readonly input: CompleteInboundPartiesCommand.Input) {
    }
}

export namespace CompleteInboundPartiesCommand {

    export class Input {
        constructor(
            public readonly id: string,
            public readonly response: PartiesTypeIDPutResponse | null,
        ) {
        }
    }

    export class Output {
    }
}

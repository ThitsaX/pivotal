import {PartiesTypeIDPutResponse} from '@shared/fspiop';

export class CompleteOutboundPartiesCommand {
    constructor(public readonly input: CompleteOutboundPartiesCommand.Input) {
    }
}

export namespace CompleteOutboundPartiesCommand {

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

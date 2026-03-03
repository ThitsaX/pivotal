import {NatsClientService} from '@shared/nats';
import {TransfersPostRequest} from '@shared/fspiop';

export class InboundTransfersPublisher {

    constructor(private readonly nats: NatsClientService) {
    }

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.transfers`;
    }

    async publish(input: InboundTransfersPublisher.Input): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(InboundTransfersPublisher.subjectFor(input.payeeFsp), this.nats.codec.encode(input.request));
    }
}

export namespace InboundTransfersPublisher {

    export class Input {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly request: TransfersPostRequest,
        ) {
        }
    }
}

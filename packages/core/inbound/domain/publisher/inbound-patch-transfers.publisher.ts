import {NatsClientService} from '@shared/nats';
import {TransfersIDPatchResponse} from '@shared/fspiop';

export class InboundPatchTransfersPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.transfers`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(input: InboundPatchTransfersPublisher.Input): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(InboundPatchTransfersPublisher.subjectFor(input.payeeFsp), this.nats.codec.encode(input.response));
    }
}

export namespace InboundPatchTransfersPublisher {

    export class Input {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly response: TransfersIDPatchResponse,
        ) {}
    }
}

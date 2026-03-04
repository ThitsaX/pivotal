import {NatsClientService} from '@shared/nats';
import {TransfersIDPatchResponse} from '@shared/fspiop';

export class InboundConnectorPatchTransfersPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.transfers`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(message: InboundConnectorPatchTransfersPublisher.Message): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(InboundConnectorPatchTransfersPublisher.subjectFor(message.payeeFsp), this.nats.codec.encode(message));
    }
}

export namespace InboundConnectorPatchTransfersPublisher {

    export class Message {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly response: TransfersIDPatchResponse,
        ) {}
    }
}

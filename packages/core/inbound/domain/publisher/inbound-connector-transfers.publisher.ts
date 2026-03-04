import {NatsClientService} from '@shared/nats';
import {TransfersPostRequest} from '@shared/fspiop';

export class InboundConnectorTransfersPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.transfers`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(message: InboundConnectorTransfersPublisher.Message): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(InboundConnectorTransfersPublisher.subjectFor(message.payeeFsp), this.nats.codec.encode(message));
    }
}

export namespace InboundConnectorTransfersPublisher {

    export class Message {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly request: TransfersPostRequest,
        ) {}
    }
}

import {NatsClientService} from '@shared/nats';
import {TransfersIDPatchResponse} from '@shared/fspiop';

export class ConnectorPatchTransfersPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.patch.transfers`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(message: ConnectorPatchTransfersPublisher.Message): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(ConnectorPatchTransfersPublisher.subjectFor(message.payeeFsp), this.nats.codec.encode(message));
    }
}

export namespace ConnectorPatchTransfersPublisher {

    export class Message {
        constructor(
            public readonly correlationId: string | null,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly transferId: string,
            public readonly response: TransfersIDPatchResponse,
        ) {}
    }
}

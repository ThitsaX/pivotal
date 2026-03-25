import {NatsClientService} from '@shared/nats';
import {TransfersPostRequest} from '@shared/fspiop';

export class ConnectorPostTransfersPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.post.transfers`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(message: ConnectorPostTransfersPublisher.Message): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(ConnectorPostTransfersPublisher.subjectFor(message.payeeFsp), this.nats.codec.encode(message));
    }
}

export namespace ConnectorPostTransfersPublisher {

    export class Message {
        constructor(
            public readonly correlationId: string | null,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly request: TransfersPostRequest,
        ) {}
    }
}

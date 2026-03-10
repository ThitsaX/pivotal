import {NatsClientService} from '@shared/nats';
import {QuotesPostRequest} from '@shared/fspiop';

export class ConnectorPostQuotesPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.post.quotes`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(message: ConnectorPostQuotesPublisher.Message): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(ConnectorPostQuotesPublisher.subjectFor(message.payeeFsp), this.nats.codec.encode(message));
    }
}

export namespace ConnectorPostQuotesPublisher {

    export class Message {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly request: QuotesPostRequest,
        ) {}
    }
}

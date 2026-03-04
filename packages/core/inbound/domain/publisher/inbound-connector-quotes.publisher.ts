import {NatsClientService} from '@shared/nats';
import {QuotesPostRequest} from '@shared/fspiop';

export class InboundConnectorQuotesPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.quotes`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(message: InboundConnectorQuotesPublisher.Message): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(InboundConnectorQuotesPublisher.subjectFor(message.payeeFsp), this.nats.codec.encode(message));
    }
}

export namespace InboundConnectorQuotesPublisher {

    export class Message {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly request: QuotesPostRequest,
        ) {}
    }
}

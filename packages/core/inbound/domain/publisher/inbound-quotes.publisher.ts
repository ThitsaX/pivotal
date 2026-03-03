import {NatsClientService} from '@shared/nats';
import {QuotesPostRequest} from '@shared/fspiop';

export class InboundQuotesPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.quotes`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(input: InboundQuotesPublisher.Input): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(InboundQuotesPublisher.subjectFor(input.payeeFsp), this.nats.codec.encode(input.request));
    }
}

export namespace InboundQuotesPublisher {

    export class Input {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly request: QuotesPostRequest,
        ) {}
    }
}

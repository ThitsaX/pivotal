import {NatsClientService} from '@shared/nats';
import {PartyIdType} from '@shared/fspiop';

export class InboundConnectorPartiesPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.parties`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(message: InboundConnectorPartiesPublisher.Message): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(InboundConnectorPartiesPublisher.subjectFor(message.payeeFsp), this.nats.codec.encode(message));
    }
}

export namespace InboundConnectorPartiesPublisher {

    export class Message {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly partyIdType: PartyIdType,
            public readonly partyId: string,
            public readonly subId: string | null | undefined,
        ) {}
    }
}

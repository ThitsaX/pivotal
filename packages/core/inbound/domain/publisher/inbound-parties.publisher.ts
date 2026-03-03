import {NatsClientService} from '@shared/nats';
import {PartyIdType} from '@shared/fspiop';

export class InboundPartiesPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.parties`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(input: InboundPartiesPublisher.Input): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(InboundPartiesPublisher.subjectFor(input.payeeFsp), this.nats.codec.encode(input));
    }
}

export namespace InboundPartiesPublisher {

    export class Input {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly correlationId: string,
            public readonly partyIdType: PartyIdType,
            public readonly partyId: string,
            public readonly subId: string | null | undefined
        ) {}
    }
}

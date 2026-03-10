import {NatsClientService} from '@shared/nats';
import {PartyIdType} from '@shared/fspiop';

export class ConnectorGetPartiesPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.get.parties`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(message: ConnectorGetPartiesPublisher.Message): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(ConnectorGetPartiesPublisher.subjectFor(message.payeeFsp), this.nats.codec.encode(message));
    }
}

export namespace ConnectorGetPartiesPublisher {

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

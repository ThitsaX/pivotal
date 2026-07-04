// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {NatsClientService} from '@shared/nats';
import {PartyIdType} from '@shared/fspiop';
import {resolveFspiopStream} from '../consumer/listener/fspiop-stream.resolver';

export class ConnectorGetPartiesPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.get.parties`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(message: ConnectorGetPartiesPublisher.Message): Promise<void> {
        const js = this.nats.nc.jetstream();
        const subject = ConnectorGetPartiesPublisher.subjectFor(message.payeeFsp);
        const jsm = await js.jetstreamManager();

        await resolveFspiopStream(jsm, subject);
        await js.publish(subject, this.nats.codec.encode(message));
    }
}

export namespace ConnectorGetPartiesPublisher {

    export class Message {
        constructor(
            public readonly correlationId: string | null,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly partyIdType: PartyIdType,
            public readonly partyId: string,
            public readonly subId: string | null | undefined,
        ) {}
    }
}

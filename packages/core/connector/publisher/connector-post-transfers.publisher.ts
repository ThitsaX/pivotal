// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {NatsClientService} from '@shared/nats';
import {TransfersPostRequest} from '@shared/fspiop';
import {resolveFspiopStream} from '../consumer/listener/fspiop-stream.resolver';

export class ConnectorPostTransfersPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.post.transfers`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(message: ConnectorPostTransfersPublisher.Message): Promise<void> {
        const js = this.nats.nc.jetstream();
        const subject = ConnectorPostTransfersPublisher.subjectFor(message.payeeFsp);
        const jsm = await js.jetstreamManager();

        await resolveFspiopStream(jsm, subject);
        await js.publish(subject, this.nats.codec.encode(message));
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

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {NatsClientService} from '@shared/nats';
import {QuotesPostRequest} from '@shared/fspiop';
import {resolveFspiopStream} from '../consumer/listener/fspiop-stream.resolver';

export class ConnectorPostQuotesPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.post.quotes`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(message: ConnectorPostQuotesPublisher.Message): Promise<void> {
        const js = this.nats.nc.jetstream();
        const subject = ConnectorPostQuotesPublisher.subjectFor(message.payeeFsp);
        const jsm = await js.jetstreamManager();

        await resolveFspiopStream(jsm, subject);
        await js.publish(subject, this.nats.codec.encode(message));
    }
}

export namespace ConnectorPostQuotesPublisher {

    export class Message {
        constructor(
            public readonly correlationId: string | null,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly request: QuotesPostRequest,
        ) {}
    }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {NatsClientService} from '@shared/nats';
import {TransfersIDPatchResponse} from '@shared/fspiop';
import {resolveFspiopStream} from '../consumer/listener/fspiop-stream.resolver';

export class ConnectorPatchTransfersPublisher {

    static subjectFor(payeeFsp: string): string {
        return `fspiop.${payeeFsp}.patch.transfers`;
    }

    constructor(private readonly nats: NatsClientService) {}

    async publish(message: ConnectorPatchTransfersPublisher.Message): Promise<void> {
        const js = this.nats.nc.jetstream();
        const subject = ConnectorPatchTransfersPublisher.subjectFor(message.payeeFsp);
        const jsm = await js.jetstreamManager();

        await resolveFspiopStream(jsm, subject);
        await js.publish(subject, this.nats.codec.encode(message));
    }
}

export namespace ConnectorPatchTransfersPublisher {

    export class Message {
        constructor(
            public readonly correlationId: string | null,
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly transferId: string,
            public readonly response: TransfersIDPatchResponse,
        ) {}
    }
}

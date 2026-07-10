// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {TransactionMessage} from '@core/audit/common';
import {NatsClientService} from '@shared/nats';

export class AuditTransactionPublisher {

    static readonly SUBJECT = 'audit.transaction';

    constructor(private readonly nats: NatsClientService) {
    }

    async publish(message: TransactionMessage): Promise<void> {
        const js = this.nats.nc.jetstream();

        await js.publish(
            AuditTransactionPublisher.SUBJECT,
            this.nats.codec.encode(message),
        );
    }
}

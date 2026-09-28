// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {connect, JSONCodec, NatsConnection} from 'nats';

export class NatsClientService implements OnModuleInit, OnModuleDestroy {

    readonly codec = JSONCodec();

    private connection: NatsConnection | undefined;

    constructor(private readonly natsUrl: string) {}

    async onModuleInit(): Promise<void> {

        if (this.natsUrl.trim().length === 0) {
            // No URL configured. Left unconnected rather than throwing, so a service whose use of
            // NATS is an optimisation still starts; `isConnected` lets those callers stand down
            // instead of failing. A service that genuinely requires NATS asks for `nc` and gets a
            // clear error rather than a confused connection failure.
            return;
        }

        this.connection = await connect({servers: this.natsUrl});
    }

    async onModuleDestroy(): Promise<void> {
        await this.connection?.drain();
    }

    /** Whether there is a connection to use, so optional consumers can skip themselves. */
    get isConnected(): boolean {
        return this.connection != null;
    }

    get nc(): NatsConnection {
        if (!this.connection) {
            throw new Error(
                'NATS connection is not established. Set NATS_URL, or check that this service '
                + 'should be using NATS at all.',
            );
        }
        return this.connection;
    }
}

import {Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {connect, JSONCodec, NatsConnection} from 'nats';

/**
 * Manages a single NATS connection for the lifetime of the NestJS module.
 *
 * Env variable  : NATS_URL
 * Default       : nats://localhost:4222
 */
@Injectable()
export class NatsClientService implements OnModuleInit, OnModuleDestroy {

    private connection: NatsConnection | undefined;

    readonly codec = JSONCodec();

    async onModuleInit(): Promise<void> {
        const url = process.env[NatsClientService.ENV_NATS_URL] ?? 'nats://localhost:4222';
        this.connection = await connect({servers: url});
    }

    async onModuleDestroy(): Promise<void> {
        // drain() waits for in-flight messages before closing
        await this.connection?.drain();
    }

    get nc(): NatsConnection {
        if (!this.connection) {
            throw new Error('NATS connection is not established yet.');
        }
        return this.connection;
    }

    private static readonly ENV_NATS_URL = 'NATS_URL';
}

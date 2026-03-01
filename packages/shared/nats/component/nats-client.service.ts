import {Inject, Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {connect, JSONCodec, NatsConnection} from 'nats';

/**
 * Injection token for the NATS server URL.
 *
 * Consumer modules must provide this token alongside NatsClientService:
 *
 * @example
 * {
 *   provide: NATS_URL,
 *   useFactory: () => process.env['NATS_URL'] ?? 'nats://localhost:4222',
 * },
 * NatsClientService,
 */
export const NATS_URL = Symbol('NATS_URL');

/**
 * Manages a single NATS connection for the lifetime of the NestJS module.
 *
 * The URL is injected via the NATS_URL token — the consumer decides the source
 * (env, config service, Vault, etc.).
 */
@Injectable()
export class NatsClientService implements OnModuleInit, OnModuleDestroy {

    readonly codec = JSONCodec();

    private connection: NatsConnection | undefined;

    constructor(@Inject(NATS_URL) private readonly url: string) {}

    async onModuleInit(): Promise<void> {
        this.connection = await connect({servers: this.url});
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
}

import {OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {connect, JSONCodec, NatsConnection} from 'nats';

export class NatsClientService implements OnModuleInit, OnModuleDestroy {

    readonly codec = JSONCodec();

    private connection: NatsConnection | undefined;

    constructor(private readonly natsUrl: string) {}

    async onModuleInit(): Promise<void> {
        this.connection = await connect({servers: this.natsUrl});
    }

    async onModuleDestroy(): Promise<void> {
        await this.connection?.drain();
    }

    get nc(): NatsConnection {
        if (!this.connection) {
            throw new Error('NATS connection is not established yet.');
        }
        return this.connection;
    }
}

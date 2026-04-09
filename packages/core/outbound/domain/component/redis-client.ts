import {OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {createClient, RedisClientType} from 'redis';
import {OutboundSettings} from './outbound-settings';

export class RedisClient implements OnModuleInit, OnModuleDestroy {

    private readonly client: RedisClientType;
    private readonly defaultTtlMs: number;

    constructor(private readonly outboundSettings: OutboundSettings) {
        this.client = createClient({url: this.outboundSettings.redisUrl});
        this.defaultTtlMs = this.outboundSettings.redisCacheItemTimeoutMs;
    }

    async onModuleInit(): Promise<void> {
        if (!this.client.isOpen) {
            await this.client.connect();
        }
    }

    async onModuleDestroy(): Promise<void> {
        if (this.client.isOpen) {
            await this.client.quit();
        }
    }

    async get<T>(key: string): Promise<T | undefined> {
        const value = await this.client.get(key);

        if (value == null) {
            return undefined;
        }

        return JSON.parse(value) as T;
    }

    async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
        const serialized = JSON.stringify(value);
        const resolvedTtlMs = ttlMs ?? this.defaultTtlMs;

        if (resolvedTtlMs <= 0) {
            await this.client.set(key, serialized);
            return;
        }

        await this.client.set(key, serialized, {PX: resolvedTtlMs});
    }

    async delete(key: string): Promise<void> {
        await this.client.del(key);
    }

    rawClient(): RedisClientType {
        return this.client;
    }
}

import {OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {createClient, RedisClientType} from 'redis';

export class RedisClient implements OnModuleInit, OnModuleDestroy {

    private readonly client: RedisClientType;

    constructor(private readonly redisUrl: string) {
        this.client = createClient({url: this.redisUrl});
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

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        const serialized = JSON.stringify(value);

        if (ttlSeconds == null) {
            await this.client.set(key, serialized);
            return;
        }

        await this.client.set(key, serialized, {EX: ttlSeconds});
    }

    async delete(key: string): Promise<void> {
        await this.client.del(key);
    }

    rawClient(): RedisClientType {
        return this.client;
    }
}

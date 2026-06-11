import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {createClient, RedisClientType} from 'redis';
import {OutboundSettings} from './outbound-settings';

export class RedisClient implements OnModuleInit, OnModuleDestroy {

    // While Redis is down the client retries every few seconds; only re-log the
    // ongoing outage once per this window so a multi-hour outage stays readable.
    private static readonly OUTAGE_LOG_INTERVAL_MS = 60_000;

    private readonly logger = new Logger(RedisClient.name);
    private readonly client: RedisClientType;
    private readonly defaultTtlMs: number;
    private connectionLost = false;
    private lastOutageLogAt = 0;

    constructor(private readonly url: string, timeoutMs: number) {
        this.client = createClient({
            url: this.url,
            socket: {
                // Reconnect with capped backoff instead of letting the process die.
                reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
            },
        });

        // Without this listener, node-redis emits an unhandled 'error' on socket
        // close and Node terminates the process (crash-looping the pod). The flag
        // collapses the per-retry error stream into a single ERROR on disconnect
        // (subsequent attempts at debug) so a prolonged outage does not spam logs.
        this.client.on('error', (error) => {
            const detail = this.describeError(error);
            const now = Date.now();

            if (this.connectionLost) {
                if (now - this.lastOutageLogAt >= RedisClient.OUTAGE_LOG_INTERVAL_MS) {
                    this.lastOutageLogAt = now;
                    this.logger.warn(`Redis still unavailable: ${detail}`);
                }
                return;
            }

            this.connectionLost = true;
            this.lastOutageLogAt = now;
            this.logger.error(`Redis connection lost: ${detail}`);
        });

        this.client.on('ready', () => {
            if (this.connectionLost) {
                this.connectionLost = false;
                this.logger.log('Redis connection re-established.');
            }
        });

        this.defaultTtlMs = timeoutMs;
    }

    private describeError(error: unknown): string {
        if (error instanceof Error) {
            const code = (error as NodeJS.ErrnoException).code;
            return error.message || code || error.name || 'unknown error';
        }

        return String(error);
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

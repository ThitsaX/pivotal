// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {createClient, RedisClientType} from 'redis';
import {OutboundSettings} from './outbound-settings';

export class RedisClient implements OnModuleInit, OnModuleDestroy {

    // While Redis is down the client retries every few seconds; only re-log the
    // ongoing outage once per this window so a multi-hour outage stays readable.
    private static readonly OUTAGE_LOG_INTERVAL_MS = 60_000;

    // Lock keys live under their own namespace so they never collide with the
    // cached TransferRequest stored under the bare transferId.
    private static readonly LOCK_KEY_PREFIX = 'lock:';

    // Compare-and-delete: only release the lock when we still own it, so a lock
    // that already expired and was re-acquired by another holder is never deleted
    // out from under that holder.
    private static readonly RELEASE_LOCK_SCRIPT =
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

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

    /**
     * Acquire a single-holder distributed lock for `key`. Returns an opaque token
     * when the lock was taken, or undefined when another holder already owns it.
     *
     * `SET NX PX` makes the lock auto-expire after `ttlMs` so a crashed holder
     * cannot deadlock the key. Callers must pass a TTL that comfortably exceeds the
     * longest in-flight operation guarded by the lock and always release it in a
     * `finally` block; the TTL is only the crash backstop.
     */
    async acquireLock(key: string, ttlMs: number): Promise<string | undefined> {
        const token = randomUUID();
        const result = await this.client.set(RedisClient.lockKey(key), token, {
            NX: true,
            PX: ttlMs,
        });

        return result === 'OK' ? token : undefined;
    }

    /**
     * Release a lock previously taken via {@link acquireLock}, but only if this
     * token still owns it. Best-effort: a failure here (e.g. Redis blip) is logged
     * and swallowed so it never masks the outcome of the work the lock guarded —
     * the TTL guarantees the lock is eventually freed regardless.
     */
    async releaseLock(key: string, token: string): Promise<void> {
        try {
            await this.client.eval(RedisClient.RELEASE_LOCK_SCRIPT, {
                keys: [RedisClient.lockKey(key)],
                arguments: [token],
            });
        } catch (error) {
            this.logger.warn(`Failed to release lock for key='${key}': ${this.describeError(error)}`);
        }
    }

    private static lockKey(key: string): string {
        return `${RedisClient.LOCK_KEY_PREFIX}${key}`;
    }

    rawClient(): RedisClientType {
        return this.client;
    }
}

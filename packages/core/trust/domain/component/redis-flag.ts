// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {createClient, RedisClientType} from 'redis';

/**
 * A yes/no fact kept in Redis, so it outlives the process that set it.
 *
 * For work that has to be finished after a restart: a flag held only in memory is forgotten
 * when the pod is replaced, and nothing else may record that the work is still owed.
 *
 * Best-effort, like the job locks: a Redis outage never throws to the caller. Reads then answer
 * "not set", so callers keep their own in-memory copy for the life of the process.
 */
export class RedisFlag implements OnModuleInit, OnModuleDestroy {

    private readonly logger = new Logger(RedisFlag.name);
    private readonly client: RedisClientType;

    constructor(
        url: string,
        private readonly key: string,
    ) {
        this.client = createClient({
            url,
            socket: {
                reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
            },
        });

        // Without a listener node-redis throws on socket close and takes the pod down.
        this.client.on('error', (error) => {
            this.logger.debug(`Redis flag '${this.key}' connection error: ${String(error)}`);
        });
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

    async isSet(): Promise<boolean> {
        try {
            return (await this.client.exists(this.key)) === 1;
        } catch (error) {
            this.logger.warn(`Could not read flag '${this.key}' from Redis: ${String(error)}`);
            return false;
        }
    }

    async set(): Promise<void> {
        try {
            await this.client.set(this.key, new Date().toISOString());
        } catch (error) {
            this.logger.warn(`Could not set flag '${this.key}' in Redis: ${String(error)}`);
        }
    }

    async clear(): Promise<void> {
        try {
            await this.client.del(this.key);
        } catch (error) {
            this.logger.warn(`Could not clear flag '${this.key}' in Redis: ${String(error)}`);
        }
    }
}

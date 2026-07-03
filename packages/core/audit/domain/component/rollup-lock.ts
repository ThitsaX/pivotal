import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {randomUUID} from 'crypto';
import {createClient, RedisClientType} from 'redis';

/**
 * Best-effort distributed lock for the rollup job, so that across N horizontally-scaled
 * `app-auditor` replicas only ONE runs the aggregation per tick.
 *
 * Resilience model (matches the plan's "fail-closed + next-tick retry"):
 *  1. **Client auto-reconnect** — capped-backoff `reconnectStrategy`, and an `error` listener
 *     so a Redis outage can never crash the pod (node-redis otherwise throws an unhandled
 *     'error' on socket close). Mirrors {@link RedisClient}.
 *  2. **Bounded retry on connection failure** — {@link acquire} retries only when the SET
 *     *throws* (Redis unreachable), a few times with short backoff. A `null` result (lock held
 *     by another replica) is the NORMAL not-the-winner case and is returned immediately — never
 *     retried.
 *  3. **Fail closed** — if every attempt still errors, `acquire` returns `null` and the caller
 *     skips this tick; the next scheduled tick retries. Safe because the rollup is idempotent.
 *
 * The lock is intentionally best-effort (not Redlock): under a Redis failover two replicas could
 * briefly both hold it, which only costs a little contention — never bad data, because the
 * rollup re-aggregates and overwrites.
 */
export class RollupLock implements OnModuleInit, OnModuleDestroy {

    private static readonly DEFAULT_MAX_ATTEMPTS = 3;
    private static readonly DEFAULT_BACKOFF_MS = 200;
    private static readonly OUTAGE_LOG_INTERVAL_MS = 60_000;

    // Release only if we still own the lock — guards against deleting a token a later tick
    // acquired after ours expired mid-run.
    private static readonly RELEASE_SCRIPT =
        `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

    private readonly logger = new Logger(RollupLock.name);
    private readonly client: RedisClientType;
    private connectionLost = false;
    private lastOutageLogAt = 0;

    constructor(
        private readonly url: string,
        private readonly lockKey: string,
        private readonly maxAttempts: number = RollupLock.DEFAULT_MAX_ATTEMPTS,
        private readonly backoffMs: number = RollupLock.DEFAULT_BACKOFF_MS,
    ) {
        this.client = createClient({
            url: this.url,
            socket: {
                reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
            },
        });

        this.client.on('error', (error) => {
            const detail = error instanceof Error ? error.message : String(error);
            const now = Date.now();

            if (this.connectionLost) {
                if (now - this.lastOutageLogAt >= RollupLock.OUTAGE_LOG_INTERVAL_MS) {
                    this.lastOutageLogAt = now;
                    this.logger.warn(`Rollup lock Redis still unavailable: ${detail}`);
                }
                return;
            }

            this.connectionLost = true;
            this.lastOutageLogAt = now;
            this.logger.error(`Rollup lock Redis connection lost: ${detail}`);
        });

        this.client.on('ready', () => {
            if (this.connectionLost) {
                this.connectionLost = false;
                this.logger.log('Rollup lock Redis connection re-established.');
            }
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

    /**
     * Tries to acquire the lock for `ttlMs`. Returns an opaque token on success (pass it to
     * {@link release}), or `null` when the lock is already held or Redis is unreachable after
     * the bounded retries — in both cases the caller should simply skip this tick.
     */
    async acquire(ttlMs: number): Promise<string | null> {
        for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
            try {
                const token = randomUUID();
                const result = await this.client.set(this.lockKey, token, {NX: true, PX: ttlMs});

                // 'OK' = we won; null = another replica holds it (normal — do not retry).
                return result === 'OK' ? token : null;
            } catch (error) {
                if (attempt === this.maxAttempts) {
                    this.logger.warn(
                        `Could not acquire rollup lock after ${this.maxAttempts} attempts ` +
                        `(Redis unavailable); skipping this tick.`,
                    );
                    return null;
                }

                await RollupLock.sleep(this.backoffMs * attempt);
            }
        }

        return null;
    }

    /**
     * Releases the lock if (and only if) we still hold `token`. Best-effort: any error is
     * swallowed because the lock's TTL guarantees eventual release regardless.
     */
    async release(token: string): Promise<void> {
        try {
            await this.client.eval(RollupLock.RELEASE_SCRIPT, {
                keys: [this.lockKey],
                arguments: [token],
            });
        } catch (error) {
            this.logger.debug(`Rollup lock release failed (will expire via TTL): ${String(error)}`);
        }
    }

    private static sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

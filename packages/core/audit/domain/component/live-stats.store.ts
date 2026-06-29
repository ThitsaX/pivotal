import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {createClient, RedisClientType} from 'redis';
import {
    classify,
    diff,
    LIVE_FIELD,
    LIVE_FIELDS,
    LIVE_VECTOR_ZERO,
    LiveVector,
} from './live-stats.classifier';

/**
 * Redis-backed counter store for the near-real-time dashboard tier. Holds, per UTC day and
 * per scope (`hub` or `fsp:{id}`), the running headline measures ({@link LiveVector}), plus a
 * short-lived per-transaction marker recording the last vector counted for each
 * `correlation_id` (so the writer can apply transition deltas — see {@link LiveStatsWriter}).
 *
 * Resilience mirrors {@link RollupLock}: own client, capped-backoff reconnect, an `error`
 * listener so a Redis outage can never crash the pod. Crucially this store is **fail-fast and
 * best-effort** — every method no-ops (or returns a zero/empty result) when Redis is not
 * ready, so a Redis hiccup can never stall the audit consume loop or a dashboard read. Any
 * gap is healed by the 5-minute reconciliation, which overwrites these counters from the
 * authoritative rollup.
 */
export class LiveStatsStore implements OnModuleInit, OnModuleDestroy {

    private static readonly KEY_PREFIX = 'pivotal:live';
    /** Counter hashes outlive a day so a late-night reconciliation/read still sees "today". */
    private static readonly COUNTER_TTL_SECONDS = 48 * 60 * 60;
    /**
     * Per-transaction marker TTL. Transactions settle in seconds, so one hour is generous; it
     * also bounds the idempotency window — a redelivered event inside the TTL re-reads the same
     * marker and yields a zero delta (no double count). Anything rarer is healed by reconciliation.
     */
    private static readonly MARKER_TTL_SECONDS = 60 * 60;

    /** Hash fields incremented as integers (everything except the fractional latency sum). */
    private static readonly INT_FIELD_NAMES =
        LIVE_FIELDS.filter((field) => field !== 'sumLatencyMs').map((field) => LIVE_FIELD[field]).join(',');
    private static readonly FLOAT_FIELD_NAME = LIVE_FIELD.sumLatencyMs;

    /**
     * Atomic compare-and-apply of one transaction event — runs server-side so concurrent
     * writers on different replicas can neither double-count nor regress a counter.
     *   KEYS[1]    = marker key;  KEYS[2..] = scope counter keys
     *   ARGV = [nextJson, markerTtl, counterTtl, rank, intFieldsCsv, floatField]
     * It reads the marker (the last vector counted for this transaction + its `_rank`), skips
     * strictly-stale events (`rank < marker._rank`), applies `next − marker` to every scope,
     * then rewrites the marker. Equal/forward ranks are safe: once the marker advances, a
     * concurrent duplicate computes a zero delta.
     */
    private static readonly APPLY_EVENT_LUA = `
        local markerKey = KEYS[1]
        local next = cjson.decode(ARGV[1])
        local markerTtl = tonumber(ARGV[2])
        local counterTtl = tonumber(ARGV[3])
        local rank = tonumber(ARGV[4])

        local prev = {}
        local prevRaw = redis.call('GET', markerKey)
        if prevRaw then prev = cjson.decode(prevRaw) end

        if prev._rank ~= nil and rank < prev._rank then
            return 0
        end

        local function apply(field, isFloat)
            local d = (next[field] or 0) - (prev[field] or 0)
            if d ~= 0 then
                for i = 2, #KEYS do
                    if isFloat then
                        redis.call('HINCRBYFLOAT', KEYS[i], field, d)
                    else
                        redis.call('HINCRBY', KEYS[i], field, math.floor(d))
                    end
                end
            end
        end

        for field in string.gmatch(ARGV[5], '([^,]+)') do apply(field, false) end
        apply(ARGV[6], true)

        for i = 2, #KEYS do redis.call('EXPIRE', KEYS[i], counterTtl) end

        next._rank = rank
        redis.call('SET', markerKey, cjson.encode(next), 'EX', markerTtl)
        return 1
    `;

    private readonly logger = new Logger(LiveStatsStore.name);
    private readonly client: RedisClientType;
    private connectionLost = false;
    private lastOutageLogAt = 0;
    private static readonly OUTAGE_LOG_INTERVAL_MS = 60_000;

    constructor(private readonly url: string) {
        this.client = createClient({
            url: this.url,
            socket: {reconnectStrategy: (retries) => Math.min(retries * 100, 3000)},
        });

        this.client.on('error', (error) => {
            const detail = error instanceof Error ? error.message : String(error);
            const now = Date.now();

            if (this.connectionLost) {
                if (now - this.lastOutageLogAt >= LiveStatsStore.OUTAGE_LOG_INTERVAL_MS) {
                    this.lastOutageLogAt = now;
                    this.logger.warn(`Live-stats Redis still unavailable: ${detail}`);
                }
                return;
            }

            this.connectionLost = true;
            this.lastOutageLogAt = now;
            this.logger.error(`Live-stats Redis connection lost: ${detail}`);
        });

        this.client.on('ready', () => {
            if (this.connectionLost) {
                this.connectionLost = false;
                this.logger.log('Live-stats Redis connection re-established.');
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

    /** UTC day key (`YYYY-MM-DD`) for a transaction's started-at — matches the dashboard's UTC "today". */
    static dateKey(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    static hubScope(): string {
        return 'hub';
    }

    static fspScope(fspId: string): string {
        return `fsp:${fspId}`;
    }

    /**
     * Atomically records one transaction event: compares against the per-transaction marker and
     * applies only the delta (`next − last counted`) to every scope, advancing the marker. Runs
     * as a single Lua script so concurrent writers across replicas can't double-count or regress
     * (see {@link APPLY_EVENT_LUA}). `rank` is the row's `updated_at` epoch-ms — strictly-older
     * events are ignored. Best-effort: no-ops when Redis is unavailable.
     */
    async applyEvent(
        correlationId: string,
        dateKey: string,
        scopes: string[],
        next: LiveVector,
        rank: number,
    ): Promise<void> {
        if (!this.client.isReady || scopes.length === 0) {
            return;
        }

        try {
            const nextHash: Record<string, number> = {};
            for (const field of LIVE_FIELDS) {
                nextHash[LIVE_FIELD[field]] = next[field];
            }

            await this.client.eval(LiveStatsStore.APPLY_EVENT_LUA, {
                keys: [
                    LiveStatsStore.markerKey(correlationId),
                    ...scopes.map((scope) => LiveStatsStore.counterKey(dateKey, scope)),
                ],
                arguments: [
                    JSON.stringify(nextHash),
                    String(LiveStatsStore.MARKER_TTL_SECONDS),
                    String(LiveStatsStore.COUNTER_TTL_SECONDS),
                    String(rank),
                    LiveStatsStore.INT_FIELD_NAMES,
                    LiveStatsStore.FLOAT_FIELD_NAME,
                ],
            });
        } catch (error) {
            this.logger.debug(`applyEvent failed: ${String(error)}`);
        }
    }

    /**
     * Overwrites a scope's counter hash with authoritative totals (used by reconciliation).
     * DEL + HSET + EXPIRE in one transaction so a concurrent read never sees a half-written hash.
     * Best-effort.
     */
    async reseedScope(dateKey: string, scope: string, totals: LiveVector): Promise<void> {
        if (!this.client.isReady) {
            return;
        }

        const key = LiveStatsStore.counterKey(dateKey, scope);

        try {
            const fields: Record<string, string> = {};
            for (const field of LIVE_FIELDS) {
                fields[LIVE_FIELD[field]] = String(totals[field]);
            }

            await this.client
                .multi()
                .del(key)
                .hSet(key, fields)
                .expire(key, LiveStatsStore.COUNTER_TTL_SECONDS)
                .exec();
        } catch (error) {
            this.logger.debug(`reseedScope failed: ${String(error)}`);
        }
    }

    /** Reads a scope's current counters for `dateKey`. Returns the zero vector when absent/unavailable. */
    async readScope(dateKey: string, scope: string): Promise<LiveVector> {
        if (!this.client.isReady) {
            return {...LIVE_VECTOR_ZERO};
        }

        try {
            const raw = await this.client.hGetAll(LiveStatsStore.counterKey(dateKey, scope));

            return LiveStatsStore.vectorFromHash(raw);
        } catch (error) {
            this.logger.debug(`readScope failed: ${String(error)}`);

            return {...LIVE_VECTOR_ZERO};
        }
    }

    private static counterKey(dateKey: string, scope: string): string {
        return `${LiveStatsStore.KEY_PREFIX}:${dateKey}:${scope}`;
    }

    private static markerKey(correlationId: string): string {
        return `${LiveStatsStore.KEY_PREFIX}:cls:${correlationId}`;
    }

    private static vectorFromHash(hash: Record<string, string>): LiveVector {
        const vector = {...LIVE_VECTOR_ZERO} as LiveVector;
        for (const field of LIVE_FIELDS) {
            const value = Number(hash[LIVE_FIELD[field]]);
            vector[field] = Number.isFinite(value) ? value : 0;
        }

        return vector;
    }
}

// Re-export the pure helpers so the writer can import classify/diff from one barrel if desired.
export {classify, diff};

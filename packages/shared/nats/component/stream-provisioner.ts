// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';
import {DiscardPolicy, JetStreamManager, RetentionPolicy, StorageType} from 'nats';

const NO_STREAM_MATCHES_SUBJECT = 'no stream matches subject';
const STREAM_ALREADY_EXISTS = 'stream name already in use';
const STREAM_NOT_FOUND = 'stream not found';
const NANOS_PER_MS = 1_000_000;

/** JetStream sentinel for "no limit" on max_bytes/max_age. */
export const UNLIMITED = -1;

/**
 * Outcome of an enforcement pass against a single stream.
 *  - `updated`  — limits drifted and were reconciled.
 *  - `in-sync`  — already carried the desired limits; nothing done.
 *  - `absent`   — the stream does not exist yet (its owner hasn't created it); skipped.
 *  - `failed`   — inspection or update errored (logged; never thrown).
 */
export type EnforceOutcome = 'updated' | 'in-sync' | 'absent' | 'failed';

const messageIncludes = (error: unknown, needle: string): boolean => {
    const maybeError = error as {message?: string};
    return maybeError.message?.toLowerCase().includes(needle) ?? false;
};

const isNoStreamMatchesSubjectError = (error: unknown): boolean =>
    messageIncludes(error, NO_STREAM_MATCHES_SUBJECT);

const isStreamAlreadyExistsError = (error: unknown): boolean =>
    messageIncludes(error, STREAM_ALREADY_EXISTS);

const isStreamNotFoundError = (error: unknown): boolean =>
    messageIncludes(error, STREAM_NOT_FOUND);

export interface StreamLimits {
    /** Stream name to create when none exists yet. */
    name: string;
    /** Wildcard subject the stream owns, e.g. `audit.>`. Used on creation. */
    streamSubject: string;
    /** Age-based purge, in milliseconds. This is the real bound on steady-state growth. */
    maxAgeMs: number;
    /**
     * Size-based hard cap, in bytes. Defaults to {@link UNLIMITED}. Prefer leaving this
     * unlimited and bounding by age: with DiscardPolicy.Old a too-tight byte cap would drop
     * the OLDEST messages first, which for a not-yet-consumed audit backlog means silent data
     * loss before the consumer has persisted it to MySQL.
     */
    maxBytes?: number;
}

const toNanos = (ms: number): number => ms * NANOS_PER_MS;

/**
 * Bring an existing stream's retention limits in line with {@link StreamLimits}, regardless of
 * who created the stream — a Pivotal service, or a Java connector that owns the stream and booted
 * first. Works from any client on the same JetStream account: stream management is account-scoped,
 * not producer/consumer-scoped, so this can bound a stream Pivotal neither produces to nor consumes.
 *
 * Only fields JetStream allows to change on a live stream are touched — `retention`, `storage`, and
 * `subjects` are left untouched (retention/storage are immutable post-creation; an unbounded stream
 * is already the default LimitsPolicy, so the update succeeds).
 *
 * A stream that does not exist yet returns `absent` (its owner hasn't created it) — the caller may
 * simply retry on the next pass. Inspection/update errors are logged and swallowed (`failed`): a
 * drift we can't fix must never throw into a startup hook or an interval callback.
 */
export const enforceStreamLimits = async (
    jsm: JetStreamManager,
    limits: StreamLimits,
    logger: Logger,
): Promise<EnforceOutcome> => {
    const desiredMaxAge = toNanos(limits.maxAgeMs);
    const desiredMaxBytes = limits.maxBytes ?? UNLIMITED;

    let current;
    try {
        const info = await jsm.streams.info(limits.name);
        current = info.config;
    } catch (error) {
        if (isStreamNotFoundError(error)) {
            logger.debug?.(`Stream='${limits.name}' not present yet; nothing to enforce.`);
            return 'absent';
        }
        logger.error(
            `Failed to inspect stream='${limits.name}' for limit enforcement.`,
            error instanceof Error ? error.stack : String(error),
        );
        return 'failed';
    }

    const inSync = current.max_age === desiredMaxAge
        && current.max_bytes === desiredMaxBytes
        && current.discard === DiscardPolicy.Old;
    if (inSync) {
        return 'in-sync';
    }

    try {
        await jsm.streams.update(limits.name, {
            max_age: desiredMaxAge,
            max_bytes: desiredMaxBytes,
            discard: DiscardPolicy.Old,
        });
        logger.log(
            `Reconciled retention on stream='${limits.name}': `
            + `max_age=${limits.maxAgeMs}ms max_bytes=${desiredMaxBytes} discard=old `
            + `(was max_age=${current.max_age}ns max_bytes=${current.max_bytes}).`,
        );
        return 'updated';
    } catch (error) {
        logger.error(
            `Failed to reconcile retention on stream='${limits.name}'; leaving existing config in place.`,
            error instanceof Error ? error.stack : String(error),
        );
        return 'failed';
    }
};

/**
 * Idempotently resolve a JetStream stream for `findSubject`, ensuring it carries the retention
 * limits in {@link StreamLimits}. Safe to call from every replica on startup and independent of
 * boot order: whoever creates the stream first, every caller reconciles the limits afterward, so
 * the config converges — no stream can grow unbounded just because a connector booted before us.
 *
 * Returns the resolved stream name (falling back to `limits.name` only if a post-create re-resolve
 * unexpectedly fails), matching the prior resolver contract.
 */
export const resolveStreamWithLimits = async (
    jsm: JetStreamManager,
    findSubject: string,
    limits: StreamLimits,
    logger: Logger,
): Promise<string> => {
    try {
        const existing = await jsm.streams.find(findSubject);
        await enforceStreamLimits(jsm, limits, logger);
        return existing;
    } catch (error) {
        if (!isNoStreamMatchesSubjectError(error)) {
            logger.error(
                `Failed to resolve stream for subject='${findSubject}'.`,
                error instanceof Error ? error.stack : String(error),
            );
            throw error;
        }
    }

    try {
        await jsm.streams.add({
            name: limits.name,
            subjects: [limits.streamSubject],
            retention: RetentionPolicy.Limits,
            discard: DiscardPolicy.Old,
            storage: StorageType.File,
            max_age: toNanos(limits.maxAgeMs),
            max_bytes: limits.maxBytes ?? UNLIMITED,
        });
    } catch (error) {
        if (!isStreamAlreadyExistsError(error)) {
            logger.error(
                `Failed to create stream='${limits.name}' for subject='${findSubject}'.`,
                error instanceof Error ? error.stack : String(error),
            );
            throw error;
        }
        // Someone else created it first (possibly without limits) — reconcile below.
    }

    try {
        const resolved = await jsm.streams.find(findSubject);
        await enforceStreamLimits(jsm, limits, logger);
        return resolved;
    } catch (error) {
        logger.error(
            `Failed to re-resolve stream for subject='${findSubject}', falling back to stream='${limits.name}'.`,
            error instanceof Error ? error.stack : String(error),
        );
        return limits.name;
    }
};

/**
 * Parse a positive-integer millisecond env value, falling back to `fallbackMs` when unset/invalid.
 */
export const parseMaxAgeMs = (envValue: string | undefined, fallbackMs: number): number => {
    const parsed = envValue != null && envValue.length > 0 ? Number.parseInt(envValue, 10) : fallbackMs;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
};

/**
 * Parse a byte cap env value. Accepts a positive integer or {@link UNLIMITED} (-1); anything else
 * falls back to `fallbackBytes`.
 */
export const parseMaxBytes = (envValue: string | undefined, fallbackBytes: number): number => {
    if (envValue == null || envValue.length === 0) {
        return fallbackBytes;
    }
    const parsed = Number.parseInt(envValue, 10);
    if (!Number.isFinite(parsed)) {
        return fallbackBytes;
    }
    return parsed === UNLIMITED || parsed > 0 ? parsed : fallbackBytes;
};

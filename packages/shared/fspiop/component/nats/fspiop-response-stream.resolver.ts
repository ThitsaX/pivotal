import {Logger} from '@nestjs/common';
import {DiscardPolicy, JetStreamManager, RetentionPolicy, StorageType} from 'nats';

const NO_STREAM_MATCHES_SUBJECT = 'no stream matches subject';
const STREAM_ALREADY_EXISTS = 'stream name already in use';

export const FSPIOP_RESPONSE_SUBJECT_PREFIX = 'pivotal.fspiop.response.';
export const FSPIOP_RESPONSE_STREAM_SUBJECT = `${FSPIOP_RESPONSE_SUBJECT_PREFIX}>`;
const DEFAULT_FSPIOP_RESPONSE_STREAM_NAME = 'PIVOTAL_FSPIOP_RESPONSE';
const DEFAULT_FSPIOP_RESPONSE_MAX_AGE_MS = 60_000;
const NANOS_PER_MS = 1_000_000;

const logger = new Logger('FspiopResponseStreamResolver');

const isNoStreamMatchesSubjectError = (error: unknown): boolean => {
    const maybeError = error as {message?: string};
    return maybeError.message?.toLowerCase().includes(NO_STREAM_MATCHES_SUBJECT) ?? false;
};

const isStreamAlreadyExistsError = (error: unknown): boolean => {
    const maybeError = error as {message?: string};
    return maybeError.message?.toLowerCase().includes(STREAM_ALREADY_EXISTS) ?? false;
};

const getStreamName = (): string => {
    return process.env['PIVOTAL_FSPIOP_RESPONSE_STREAM_NAME'] ?? DEFAULT_FSPIOP_RESPONSE_STREAM_NAME;
};

const getMaxAgeNanos = (): number => {
    const envValue = process.env['PIVOTAL_FSPIOP_RESPONSE_MAX_AGE_MS'];
    const ms = envValue != null && envValue.length > 0
        ? Number.parseInt(envValue, 10)
        : DEFAULT_FSPIOP_RESPONSE_MAX_AGE_MS;
    const safeMs = Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_FSPIOP_RESPONSE_MAX_AGE_MS;
    return safeMs * NANOS_PER_MS;
};

/**
 * Resolves (or creates) the JetStream stream that backs FSPIOP request/response correlation.
 *
 * LimitsPolicy retention with a short max_age is intentional: every outbound replica runs its
 * own ephemeral consumer filtered on `fspiop.response.>`, and all of them must see every
 * message (so concurrent waiters on the same parties tuple both resolve). Messages are
 * auto-purged after max_age regardless of acks.
 */
export const resolveFspiopResponseStream = async (jsm: JetStreamManager): Promise<string> => {
    const streamName = getStreamName();

    try {
        return await jsm.streams.find(FSPIOP_RESPONSE_STREAM_SUBJECT);
    } catch (error) {
        if (!isNoStreamMatchesSubjectError(error)) {
            logger.error(
                `Failed to resolve stream for subject='${FSPIOP_RESPONSE_STREAM_SUBJECT}'.`,
                error instanceof Error ? error.stack : String(error),
            );
            throw error;
        }
    }

    try {
        await jsm.streams.add({
            name: streamName,
            subjects: [FSPIOP_RESPONSE_STREAM_SUBJECT],
            retention: RetentionPolicy.Limits,
            discard: DiscardPolicy.Old,
            storage: StorageType.File,
            max_age: getMaxAgeNanos(),
        });
    } catch (error) {
        if (!isStreamAlreadyExistsError(error)) {
            logger.error(
                `Failed to create stream='${streamName}' for subject='${FSPIOP_RESPONSE_STREAM_SUBJECT}'.`,
                error instanceof Error ? error.stack : String(error),
            );
            throw error;
        }
    }

    try {
        return await jsm.streams.find(FSPIOP_RESPONSE_STREAM_SUBJECT);
    } catch (error) {
        logger.error(
            `Failed to re-resolve stream for subject='${FSPIOP_RESPONSE_STREAM_SUBJECT}', falling back to stream='${streamName}'.`,
            error instanceof Error ? error.stack : String(error),
        );
        return streamName;
    }
};

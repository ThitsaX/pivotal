import {Logger} from '@nestjs/common';
import {JetStreamManager} from 'nats';

const NO_STREAM_MATCHES_SUBJECT = 'no stream matches subject';
const STREAM_ALREADY_EXISTS = 'stream name already in use';
const DEFAULT_AUDIT_STREAM_NAME = 'PIVOTAL_AUDIT';
const DEFAULT_AUDIT_STREAM_SUBJECT = 'audit.>';
const logger = new Logger('AuditStreamResolver');

const isNoStreamMatchesSubjectError = (error: unknown): boolean => {
    const maybeError = error as {message?: string};
    return maybeError.message?.toLowerCase().includes(NO_STREAM_MATCHES_SUBJECT) ?? false;
};

const isStreamAlreadyExistsError = (error: unknown): boolean => {
    const maybeError = error as {message?: string};
    return maybeError.message?.toLowerCase().includes(STREAM_ALREADY_EXISTS) ?? false;
};

const getAuditStreamName = (): string => {
    return process.env['PIVOTAL_AUDIT_STREAM_NAME'] ?? DEFAULT_AUDIT_STREAM_NAME;
};

export const resolveAuditStream = async (jsm: JetStreamManager, subject: string): Promise<string> => {
    try {
        return await jsm.streams.find(subject);
    } catch (error) {
        if (!isNoStreamMatchesSubjectError(error)) {
            logger.error(
                `Failed to resolve stream for subject='${subject}'.`,
                error instanceof Error ? error.stack : String(error),
            );
            throw error;
        }
    }

    const streamName = getAuditStreamName();
    try {
        await jsm.streams.add({
            name: streamName,
            subjects: [DEFAULT_AUDIT_STREAM_SUBJECT],
        });
    } catch (error) {
        if (!isStreamAlreadyExistsError(error)) {
            logger.error(
                `Failed to create stream='${streamName}' for subject='${subject}'.`,
                error instanceof Error ? error.stack : String(error),
            );
            throw error;
        }
    }

    try {
        return await jsm.streams.find(subject);
    } catch (error) {
        logger.error(
            `Failed to re-resolve stream for subject='${subject}', falling back to stream='${streamName}'.`,
            error instanceof Error ? error.stack : String(error),
        );
        return streamName;
    }
};

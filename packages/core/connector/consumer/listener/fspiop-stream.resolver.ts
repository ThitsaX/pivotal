// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Logger} from '@nestjs/common';
import {JetStreamManager} from 'nats';

const NO_STREAM_MATCHES_SUBJECT = 'no stream matches subject';
const STREAM_ALREADY_EXISTS = 'stream name already in use';
const DEFAULT_FSPIOP_STREAM_NAME = 'PIVOTAL_FSPIOP';
const DEFAULT_FSPIOP_STREAM_SUBJECT = 'fspiop.>';
const logger = new Logger('FspiopStreamResolver');

const isNoStreamMatchesSubjectError = (error: unknown): boolean => {
    const maybeError = error as {message?: string};
    return maybeError.message?.toLowerCase().includes(NO_STREAM_MATCHES_SUBJECT) ?? false;
};

const isStreamAlreadyExistsError = (error: unknown): boolean => {
    const maybeError = error as {message?: string};
    return maybeError.message?.toLowerCase().includes(STREAM_ALREADY_EXISTS) ?? false;
};

const getFspiopStreamName = (): string => {
    return process.env['PIVOTAL_FSPIOP_STREAM_NAME'] ?? DEFAULT_FSPIOP_STREAM_NAME;
};

export const resolveFspiopStream = async (jsm: JetStreamManager, subject: string): Promise<string> => {
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

    const streamName = getFspiopStreamName();
    try {
        await jsm.streams.add({
            name: streamName,
            subjects: [DEFAULT_FSPIOP_STREAM_SUBJECT],
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

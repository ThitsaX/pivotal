import {JetStreamManager} from 'nats';

const NO_STREAM_MATCHES_SUBJECT = 'no stream matches subject';
const STREAM_ALREADY_EXISTS = 'stream name already in use';
const DEFAULT_FSPIOP_STREAM_NAME = 'PIVOTAL_FSPIOP';
const DEFAULT_FSPIOP_STREAM_SUBJECT = 'fspiop.>';

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
            throw error;
        }
    }

    try {
        return await jsm.streams.find(subject);
    } catch {
        return streamName;
    }
};

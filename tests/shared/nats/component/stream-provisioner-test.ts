import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {Logger} from '@nestjs/common';
import {DiscardPolicy, JetStreamManager, RetentionPolicy, StorageType} from 'nats';
import {
    enforceStreamLimits,
    parseMaxAgeMs,
    parseMaxBytes,
    resolveStreamWithLimits,
    UNLIMITED,
} from '../../../../packages/shared/nats/component/stream-provisioner';

const NANOS_PER_MS = 1_000_000;
const NO_MATCH = new Error('no stream matches subject');
const ALREADY_EXISTS = new Error('stream name already in use');
const NOT_FOUND = new Error('stream not found');

// Silence Nest's logger during the run; the provisioner logs on reconcile/failure paths.
const logger = new Logger('test');
logger.log = (): void => {};
logger.error = (): void => {};
logger.debug = (): void => {};

interface AddCall {name: string; config: Record<string, unknown>}
interface UpdateCall {name: string; config: Record<string, unknown>}

interface FakeOptions {
    /** Stream name returned by find(), or an Error find() should throw. */
    find: string | Error | Array<string | Error>;
    /** Config returned by info(); when set, reconcile can inspect it. */
    info?: Record<string, unknown>;
    /** Error add() should throw, if any. */
    addThrows?: Error;
}

function fakeJsm(options: FakeOptions): {
    jsm: JetStreamManager;
    calls: {add: AddCall[]; update: UpdateCall[]; info: number};
} {
    const calls = {add: [] as AddCall[], update: [] as UpdateCall[], info: 0};
    const findQueue = Array.isArray(options.find) ? [...options.find] : [options.find];

    const nextFind = (): Promise<string> => {
        const value = findQueue.length > 1 ? findQueue.shift()! : findQueue[0];
        return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
    };

    const streams = {
        find: (): Promise<string> => nextFind(),
        add: (config: Record<string, unknown>): Promise<unknown> => {
            calls.add.push({name: config['name'] as string, config});
            if (options.addThrows) {
                return Promise.reject(options.addThrows);
            }
            return Promise.resolve({config});
        },
        info: (name: string): Promise<unknown> => {
            calls.info++;
            return Promise.resolve({config: {name, ...(options.info ?? {})}});
        },
        update: (name: string, config: Record<string, unknown>): Promise<unknown> => {
            calls.update.push({name, config});
            return Promise.resolve({config});
        },
    };

    return {jsm: {streams} as unknown as JetStreamManager, calls};
}

const limits = {
    name: 'PIVOTAL_TEST',
    streamSubject: 'test.>',
    maxAgeMs: 3_600_000,
    maxBytes: UNLIMITED,
};

describe('resolveStreamWithLimits — creation', () => {

    it('creates the stream with age/size limits when none exists', async () => {
        const {jsm, calls} = fakeJsm({find: [NO_MATCH, 'PIVOTAL_TEST']});

        const name = await resolveStreamWithLimits(jsm, 'test.subject', limits, logger);

        assert.equal(name, 'PIVOTAL_TEST');
        assert.equal(calls.add.length, 1);
        const config = calls.add[0].config;
        assert.equal(config['retention'], RetentionPolicy.Limits);
        assert.equal(config['discard'], DiscardPolicy.Old);
        assert.equal(config['storage'], StorageType.File);
        assert.equal(config['max_age'], 3_600_000 * NANOS_PER_MS);
        assert.equal(config['max_bytes'], UNLIMITED);
        assert.deepEqual(config['subjects'], ['test.>']);
    });
});

describe('resolveStreamWithLimits — reconcile of an existing stream', () => {

    it('updates limits when an existing stream drifted (created unbounded by another service)', async () => {
        const {jsm, calls} = fakeJsm({
            find: 'PIVOTAL_TEST',
            info: {max_age: 0, max_bytes: UNLIMITED, discard: DiscardPolicy.Old},
        });

        await resolveStreamWithLimits(jsm, 'test.subject', limits, logger);

        assert.equal(calls.add.length, 0, 'must not recreate an existing stream');
        assert.equal(calls.update.length, 1);
        assert.equal(calls.update[0].name, 'PIVOTAL_TEST');
        assert.equal(calls.update[0].config['max_age'], 3_600_000 * NANOS_PER_MS);
        assert.equal(calls.update[0].config['discard'], DiscardPolicy.Old);
    });

    it('does not update when the existing stream is already in sync', async () => {
        const {jsm, calls} = fakeJsm({
            find: 'PIVOTAL_TEST',
            info: {max_age: 3_600_000 * NANOS_PER_MS, max_bytes: UNLIMITED, discard: DiscardPolicy.Old},
        });

        await resolveStreamWithLimits(jsm, 'test.subject', limits, logger);

        assert.equal(calls.update.length, 0);
    });

    it('reconciles after losing the create race (stream already in use)', async () => {
        const {jsm, calls} = fakeJsm({
            find: [NO_MATCH, 'PIVOTAL_TEST'],
            addThrows: ALREADY_EXISTS,
            info: {max_age: 0, max_bytes: UNLIMITED, discard: DiscardPolicy.Old},
        });

        const name = await resolveStreamWithLimits(jsm, 'test.subject', limits, logger);

        assert.equal(name, 'PIVOTAL_TEST');
        assert.equal(calls.add.length, 1, 'attempted to create');
        assert.equal(calls.update.length, 1, 'reconciled the stream the winner created');
    });
});

describe('resolveStreamWithLimits — failure handling', () => {

    it('rethrows a non-"no stream matches" find error', async () => {
        const {jsm} = fakeJsm({find: new Error('connection reset')});

        await assert.rejects(() => resolveStreamWithLimits(jsm, 'test.subject', limits, logger));
    });

    it('falls back to the configured name when re-resolve fails after create', async () => {
        const {jsm} = fakeJsm({find: [NO_MATCH, new Error('still no match')]});

        const name = await resolveStreamWithLimits(jsm, 'test.subject', limits, logger);

        assert.equal(name, 'PIVOTAL_TEST');
    });
});

describe('enforceStreamLimits — foreign/existing stream (no create)', () => {

    function enforceJsm(info: Record<string, unknown> | Error): {
        jsm: JetStreamManager;
        calls: {info: number; update: UpdateCall[]};
    } {
        const calls = {info: 0, update: [] as UpdateCall[]};
        const streams = {
            info: (name: string): Promise<unknown> => {
                calls.info++;
                return info instanceof Error ? Promise.reject(info) : Promise.resolve({config: {name, ...info}});
            },
            update: (name: string, config: Record<string, unknown>): Promise<unknown> => {
                calls.update.push({name, config});
                return Promise.resolve({config});
            },
        };
        return {jsm: {streams} as unknown as JetStreamManager, calls};
    }

    it('returns "absent" and never updates when the stream does not exist yet', async () => {
        const {jsm, calls} = enforceJsm(NOT_FOUND);

        const outcome = await enforceStreamLimits(jsm, limits, logger);

        assert.equal(outcome, 'absent');
        assert.equal(calls.update.length, 0);
    });

    it('returns "updated" and tightens a drifted (unbounded) foreign stream', async () => {
        const {jsm, calls} = enforceJsm({max_age: 0, max_bytes: UNLIMITED, discard: DiscardPolicy.Old});

        const outcome = await enforceStreamLimits(jsm, limits, logger);

        assert.equal(outcome, 'updated');
        assert.equal(calls.update.length, 1);
        assert.equal(calls.update[0].config['max_age'], 3_600_000 * NANOS_PER_MS);
    });

    it('returns "in-sync" and does not update when limits already match', async () => {
        const {jsm, calls} = enforceJsm({
            max_age: 3_600_000 * NANOS_PER_MS,
            max_bytes: UNLIMITED,
            discard: DiscardPolicy.Old,
        });

        const outcome = await enforceStreamLimits(jsm, limits, logger);

        assert.equal(outcome, 'in-sync');
        assert.equal(calls.update.length, 0);
    });

    it('returns "failed" (not "absent") on a non-not-found inspection error', async () => {
        const {jsm, calls} = enforceJsm(new Error('connection reset'));

        const outcome = await enforceStreamLimits(jsm, limits, logger);

        assert.equal(outcome, 'failed');
        assert.equal(calls.update.length, 0);
    });
});

describe('parseMaxAgeMs', () => {

    it('returns the parsed value for a positive integer', () => {
        assert.equal(parseMaxAgeMs('120000', 5000), 120000);
    });

    it('falls back on unset, empty, non-numeric, zero, or negative input', () => {
        assert.equal(parseMaxAgeMs(undefined, 5000), 5000);
        assert.equal(parseMaxAgeMs('', 5000), 5000);
        assert.equal(parseMaxAgeMs('abc', 5000), 5000);
        assert.equal(parseMaxAgeMs('0', 5000), 5000);
        assert.equal(parseMaxAgeMs('-1', 5000), 5000);
    });
});

describe('parseMaxBytes', () => {

    it('returns a positive integer', () => {
        assert.equal(parseMaxBytes('1048576', UNLIMITED), 1048576);
    });

    it('accepts the unlimited sentinel (-1)', () => {
        assert.equal(parseMaxBytes('-1', 1000), UNLIMITED);
    });

    it('falls back on unset, empty, non-numeric, zero, or other negatives', () => {
        assert.equal(parseMaxBytes(undefined, UNLIMITED), UNLIMITED);
        assert.equal(parseMaxBytes('', 1000), 1000);
        assert.equal(parseMaxBytes('abc', 1000), 1000);
        assert.equal(parseMaxBytes('0', 1000), 1000);
        assert.equal(parseMaxBytes('-5', 1000), 1000);
    });
});

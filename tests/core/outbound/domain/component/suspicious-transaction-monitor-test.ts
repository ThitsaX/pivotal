import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {FspiopErrors, FspiopException} from '@shared/fspiop';
import {
    SuspiciousTransactionMatchField,
    SuspiciousTransactionMonitor,
} from '../../../../../packages/core/outbound/domain/component/suspicious-transaction-monitor';

const PATTERN: SuspiciousTransactionMonitor.Pattern = {
    payerFsp: 'wallet1',
    payerId: '2769100001',
    payeeFsp: 'wallet2',
    payeeId: '2769200001',
    currency: 'USD',
    amount: '10',
};

const DEFAULT_KEY = 'suspicious:wallet1|2769100001|wallet2|2769200001|10';

function isSuspiciousTransactionPattern(error: unknown): boolean {
    return error instanceof FspiopException
        && error.errorDefinition.errorType.code === FspiopErrors.SUSPICIOUS_TRANSACTION_PATTERN.errorType.code;
}

function fakeRedis(counts: number[]): {
    calls: Array<{key: string; ttlMs: number}>;
    incrementWithTtl(key: string, ttlMs: number): Promise<number>;
} {
    const calls: Array<{key: string; ttlMs: number}> = [];
    let index = 0;

    return {
        calls,
        async incrementWithTtl(key: string, ttlMs: number): Promise<number> {
            calls.push({key, ttlMs});
            const count = counts[index] ?? counts[counts.length - 1] ?? 0;
            index += 1;
            return count;
        },
    };
}

describe('SuspiciousTransactionMonitor', () => {

    it('builds a stable Redis key from the default matching fields', () => {
        assert.equal(SuspiciousTransactionMonitor.buildKey(PATTERN), DEFAULT_KEY);
    });

    it('builds a Redis key from a custom field subset including currency', () => {
        assert.equal(
            SuspiciousTransactionMonitor.buildKey(PATTERN, [
                SuspiciousTransactionMatchField.PAYER_ID_VALUE,
                SuspiciousTransactionMatchField.AMOUNT,
                SuspiciousTransactionMatchField.CURRENCY,
            ]),
            'suspicious:2769100001|10|USD',
        );
    });

    it('parses matching fields and rejects unknown tokens', () => {
        assert.deepEqual(
            SuspiciousTransactionMonitor.parseMatchingFields(
                'payerFspId, payerIdValue, payeeFspId, payeeIdValue, amount',
            ),
            [...SuspiciousTransactionMonitor.DEFAULT_MATCHING_FIELDS],
        );

        assert.throws(
            () => SuspiciousTransactionMonitor.parseMatchingFields('payerFspId,bogus'),
            /Invalid SUSPICIOUS_TRANSACTION_MATCHING_FIELDS value 'bogus'/,
        );
        assert.throws(
            () => SuspiciousTransactionMonitor.parseMatchingFields(' , '),
            /must list at least one field/,
        );
    });

    it('allows the first threshold attempts in the window', async () => {
        const redis = fakeRedis([1, 2, 3]);
        const monitor = new SuspiciousTransactionMonitor(redis as never, 180_000, 3);

        await monitor.assertNotSuspicious(PATTERN);
        await monitor.assertNotSuspicious(PATTERN);
        await monitor.assertNotSuspicious(PATTERN);

        assert.equal(redis.calls.length, 3);
        assert.deepEqual(redis.calls[0], {
            key: DEFAULT_KEY,
            ttlMs: 180_000,
        });
    });

    it('rejects when count exceeds the threshold before Hub would be called', async () => {
        const redis = fakeRedis([4]);
        const monitor = new SuspiciousTransactionMonitor(redis as never, 180_000, 3);

        await assert.rejects(
            () => monitor.assertNotSuspicious(PATTERN),
            isSuspiciousTransactionPattern,
        );
        assert.equal(redis.calls.length, 1);
    });

    it('skips Redis when the master switch is disabled', async () => {
        const redis = fakeRedis([99]);
        const monitor = new SuspiciousTransactionMonitor(redis as never, 180_000, 3, false);

        await monitor.assertNotSuspicious(PATTERN);
        assert.equal(redis.calls.length, 0);
    });

    it('skips Redis when the window is disabled', async () => {
        const redis = fakeRedis([99]);
        const monitor = new SuspiciousTransactionMonitor(redis as never, 0, 3);

        await monitor.assertNotSuspicious(PATTERN);
        assert.equal(redis.calls.length, 0);
    });

    it('skips Redis when the threshold is disabled', async () => {
        const redis = fakeRedis([99]);
        const monitor = new SuspiciousTransactionMonitor(redis as never, 180_000, 0);

        await monitor.assertNotSuspicious(PATTERN);
        assert.equal(redis.calls.length, 0);
    });

    it('fails closed when Redis is unavailable so acceptParty does not continue', async () => {
        const redis = {
            calls: [] as Array<{key: string; ttlMs: number}>,
            async incrementWithTtl(key: string, ttlMs: number): Promise<number> {
                this.calls.push({key, ttlMs});
                throw new Error('Redis connection refused');
            },
        };
        const monitor = new SuspiciousTransactionMonitor(redis as never, 180_000, 3);

        await assert.rejects(
            () => monitor.assertNotSuspicious(PATTERN),
            (error: unknown) => error instanceof Error
                && error.message === 'Redis connection refused',
        );
        assert.equal(redis.calls.length, 1);
    });
});

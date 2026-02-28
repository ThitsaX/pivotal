import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Snowflake } from '../../../../packages/shared/snowflake/component/snowflake';

const SEQUENCE_BITS = 12n;
const NODE_ID_BITS = 10n;
const TIMESTAMP_SHIFT = SEQUENCE_BITS + NODE_ID_BITS;
const NODE_ID_SHIFT = SEQUENCE_BITS;
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n;
const MAX_NODE_ID = (1n << NODE_ID_BITS) - 1n;

function decodeSnowflake(id: bigint): { timestamp: bigint; nodeId: bigint; sequence: bigint } {
    const timestamp = id >> TIMESTAMP_SHIFT;
    const nodeId = (id >> NODE_ID_SHIFT) & MAX_NODE_ID;
    const sequence = id & MAX_SEQUENCE;

    return { timestamp, nodeId, sequence };
}

describe('Snowflake', () => {

    it('should generate monotonically increasing ids in sequential calls', () => {
        const snowflake = Snowflake.get();
        const total = 20_000;
        let previous = 0n;

        for (let i = 0; i < total; i += 1) {
            const current = snowflake.nextId();

            if (i > 0) {
                assert.equal(current > previous, true);
            }

            previous = current;
        }
    });

    it('should generate unique ids under high concurrent load', async () => {
        const snowflake = Snowflake.get();
        const workers = 64;
        const idsPerWorker = 2_000;
        const total = workers * idsPerWorker;

        const batches = await Promise.all(
            Array.from({ length: workers }, () => new Promise<bigint[]>((resolve) => {
                setImmediate(() => {
                    const ids: bigint[] = [];

                    for (let i = 0; i < idsPerWorker; i += 1) {
                        ids.push(snowflake.nextId());
                    }

                    resolve(ids);
                });
            })),
        );

        const allIds = batches.flat();
        const uniqueIds = new Set(allIds);

        assert.equal(allIds.length, total);
        assert.equal(uniqueIds.size, total);

        const firstNodeId = decodeSnowflake(allIds[0]).nodeId;

        for (const id of allIds) {
            const decoded = decodeSnowflake(id);

            assert.equal(decoded.nodeId, firstNodeId);
            assert.equal(decoded.sequence >= 0n, true);
            assert.equal(decoded.sequence <= MAX_SEQUENCE, true);
            assert.equal(decoded.timestamp >= 0n, true);
        }
    });

    it('should recover when clock moves backwards', () => {
        const snowflake = Snowflake.get() as unknown as {
            lastTimestamp: number;
            nextId(): bigint;
        };

        const originalNow = Date.now;
        const originalLastTimestamp = snowflake.lastTimestamp;
        const bigBang = 1_577_813_400_000;
        const calls = [bigBang + 999, bigBang + 1000, bigBang + 1001];
        let index = 0;

        Date.now = () => {
            const current = calls[Math.min(index, calls.length - 1)];
            index += 1;

            return current;
        };

        try {
            snowflake.lastTimestamp = 1000;

            const id = snowflake.nextId();
            const decoded = decodeSnowflake(id);

            assert.equal(Number(decoded.timestamp), 1001);
        } finally {
            snowflake.lastTimestamp = originalLastTimestamp;
            Date.now = originalNow;
        }
    });
});

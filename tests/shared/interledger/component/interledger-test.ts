import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { describe, it } from 'node:test';
import { Interledger } from '../../../../packages/shared/interledger/component/interledger';

describe('Interledger', () => {

    it('should create address with g prefix', () => {
        const address = Interledger.address('fsp-a');

        assert.equal(address, 'g.fsp-a');
    });

    it('should encode and decode base64url without padding', () => {
        const source = Buffer.from('hello-interledger', 'utf-8');

        const encoded = Interledger.base64Encode(source, false);
        const decoded = Interledger.base64Decode(encoded);

        assert.equal(encoded.includes('='), false);
        assert.deepEqual(decoded, source);
    });

    it('should encode and decode base64url with padding', () => {
        const source = Buffer.from('a', 'utf-8');

        const encoded = Interledger.base64Encode(source, true);
        const decoded = Interledger.base64Decode(encoded);

        assert.equal(encoded.endsWith('=='), true);
        assert.deepEqual(decoded, source);
    });

    it('should create prepare packet and unwrap values', () => {
        const now = 1_700_000_000_000;
        const originalNow = Date.now;
        Date.now = () => now;

        try {
            const prepared = Interledger.prepare('secret', 'g.fsp-b', 10n, 'payload', 30);
            const unwrapped = Interledger.unwrap(prepared.base64PreparePacket);
            const decodedFulfillment = Interledger.base64Decode(prepared.base64Fulfillment);
            const derivedCondition = crypto.createHash('sha256').update(decodedFulfillment).digest();
            const base64DerivedCondition = Interledger.base64Encode(derivedCondition, false);

            assert.equal(unwrapped.amount, '10');
            assert.equal(unwrapped.destination, 'g.fsp-b');
            assert.equal(unwrapped.data.toString('utf-8'), 'payload');
            assert.equal(unwrapped.expiresAt.toISOString(), new Date(now + 30_000).toISOString());
            assert.equal(prepared.base64Condition, base64DerivedCondition);
        } finally {
            Date.now = originalNow;
        }
    });

    it('should return fulfilment when condition matches', () => {
        const prepared = Interledger.prepare('secret', 'g.fsp-b', 100n, 'payload', 60);
        const unwrapped = Interledger.unwrap(prepared.base64PreparePacket);
        const payload = unwrapped.data.toString('utf-8');

        const fulfilment = Interledger.fulfil(
            'secret',
            unwrapped.destination,
            BigInt(unwrapped.amount),
            payload,
            prepared.base64Condition,
            60,
        );

        assert.equal(fulfilment.valid, true);
        assert.equal(fulfilment.base64Fulfillment, prepared.base64Fulfillment);
    });

    it('should mark fulfilment invalid when condition does not match', () => {
        const prepared = Interledger.prepare('secret', 'g.fsp-b', 100n, 'payload', 60);
        const unwrapped = Interledger.unwrap(prepared.base64PreparePacket);
        const payload = unwrapped.data.toString('utf-8');

        const fulfilment = Interledger.fulfil(
            'secret',
            unwrapped.destination,
            BigInt(unwrapped.amount),
            payload,
            'invalid-condition',
            60,
        );

        assert.equal(fulfilment.valid, false);
        assert.equal(typeof fulfilment.base64Fulfillment, 'string');
    });
});

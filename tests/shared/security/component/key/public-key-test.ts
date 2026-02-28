import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PublicKey } from '../../../../../packages/shared/security/component/key/public-key';

describe('PublicKey', () => {

    it('should create a defensive copy from input buffer', () => {
        const source = Buffer.from('public-key', 'utf-8');

        const publicKey = PublicKey.fromBuffer(source);
        source.write('X', 0, 'utf-8');

        assert.equal(publicKey.toBuffer().toString('utf-8'), 'public-key');
    });

    it('should return a defensive copy from toBuffer', () => {
        const publicKey = PublicKey.fromBuffer(Buffer.from('public-key', 'utf-8'));

        const returned = publicKey.toBuffer();
        returned.write('X', 0, 'utf-8');

        assert.equal(publicKey.toBuffer().toString('utf-8'), 'public-key');
    });
});

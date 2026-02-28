import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PrivateKey } from '../../../../../packages/shared/security/component/key/private-key';

describe('PrivateKey', () => {

    it('should create a defensive copy from input buffer', () => {
        const source = Buffer.from('private-key', 'utf-8');

        const privateKey = PrivateKey.fromBuffer(source);
        source.write('X', 0, 'utf-8');

        assert.equal(privateKey.toBuffer().toString('utf-8'), 'private-key');
    });

    it('should return a defensive copy from toBuffer', () => {
        const privateKey = PrivateKey.fromBuffer(Buffer.from('private-key', 'utf-8'));

        const returned = privateKey.toBuffer();
        returned.write('X', 0, 'utf-8');

        assert.equal(privateKey.toBuffer().toString('utf-8'), 'private-key');
    });
});

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PublicKey } from '../../../../../packages/shared/security/component/key/public-key';
import { TEST_PRIVATE_KEY_PEM, TEST_PUBLIC_KEY_PEM } from './test-key-fixtures';

describe('PublicKey', () => {

    it('should create a defensive copy from input buffer', () => {
        const source = Buffer.from(TEST_PUBLIC_KEY_PEM, 'utf-8');

        const publicKey = PublicKey.fromBuffer(source);
        source.write('X', 0, 'utf-8');

        assert.equal(publicKey.toBuffer().toString('utf-8'), TEST_PUBLIC_KEY_PEM);
    });

    it('should return a defensive copy from toBuffer', () => {
        const publicKey = PublicKey.fromBuffer(Buffer.from(TEST_PUBLIC_KEY_PEM, 'utf-8'));

        const returned = publicKey.toBuffer();
        returned.write('X', 0, 'utf-8');

        assert.equal(publicKey.toBuffer().toString('utf-8'), TEST_PUBLIC_KEY_PEM);
    });

    it('should throw when buffer is not a public key', () => {
        assert.throws(
            () => PublicKey.fromBuffer(Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8')),
            /Invalid public key buffer. Expected a valid public key\./,
        );
    });
});

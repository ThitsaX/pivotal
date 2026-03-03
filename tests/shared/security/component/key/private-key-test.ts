import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PrivateKey } from '../../../../../packages/shared/security/component/key/private-key';
import { TEST_PRIVATE_KEY_PEM, TEST_PUBLIC_KEY_PEM } from './test-key-fixtures';

describe('PrivateKey', () => {

    it('should create a defensive copy from input buffer', () => {
        const source = Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8');

        const privateKey = PrivateKey.fromBuffer(source);
        source.write('X', 0, 'utf-8');

        assert.equal(privateKey.toBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should return a defensive copy from toBuffer', () => {
        const privateKey = PrivateKey.fromBuffer(Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8'));

        const returned = privateKey.toBuffer();
        returned.write('X', 0, 'utf-8');

        assert.equal(privateKey.toBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should throw when buffer is not a private key', () => {
        assert.throws(
            () => PrivateKey.fromBuffer(Buffer.from(TEST_PUBLIC_KEY_PEM, 'utf-8')),
            /Invalid private key buffer. Expected a valid private key\./,
        );
    });
});

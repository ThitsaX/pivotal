import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Ca } from '../../../../../packages/shared/security/component/cert/ca';
import { TEST_CERT_PEM, TEST_PRIVATE_KEY_PEM } from './test-cert-fixtures';

describe('Ca', () => {

    it('should create a defensive copy from input buffer', () => {
        const source = Buffer.from(TEST_CERT_PEM, 'utf-8');

        const ca = Ca.fromBuffer(source);
        source.write('X', 0, 'utf-8');

        assert.equal(ca.toBuffer().toString('utf-8'), TEST_CERT_PEM);
    });

    it('should return a defensive copy from toBuffer', () => {
        const ca = Ca.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8'));

        const returned = ca.toBuffer();
        returned.write('X', 0, 'utf-8');

        assert.equal(ca.toBuffer().toString('utf-8'), TEST_CERT_PEM);
    });

    it('should support a bundle containing multiple CA certificates', () => {
        const bundled = `${TEST_CERT_PEM}${TEST_CERT_PEM}`;
        const ca = Ca.fromBuffer(Buffer.from(bundled, 'utf-8'));

        assert.equal(ca.toBuffer().toString('utf-8'), bundled);
    });

    it('should throw when buffer is not certificate content', () => {
        assert.throws(
            () => Ca.fromBuffer(Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8')),
            /Invalid CA buffer\./,
        );
    });
});

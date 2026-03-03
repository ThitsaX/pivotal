import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CaCert } from '../../../../../packages/shared/security/component/cert/ca-cert';
import { TEST_CERT_PEM, TEST_PRIVATE_KEY_PEM } from './test-cert-fixtures';

describe('CaCert', () => {

    it('should create a defensive copy from input buffer', () => {
        const source = Buffer.from(TEST_CERT_PEM, 'utf-8');

        const cert = CaCert.fromBuffer(source);
        source.write('X', 0, 'utf-8');

        assert.equal(cert.toBuffer().toString('utf-8'), TEST_CERT_PEM);
    });

    it('should return a defensive copy from toBuffer', () => {
        const cert = CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8'));

        const returned = cert.toBuffer();
        returned.write('X', 0, 'utf-8');

        assert.equal(cert.toBuffer().toString('utf-8'), TEST_CERT_PEM);
    });

    it('should throw when buffer is not a certificate', () => {
        assert.throws(
            () => CaCert.fromBuffer(Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8')),
            /Invalid certificate buffer. Expected a valid X\.509 certificate\./,
        );
    });
});

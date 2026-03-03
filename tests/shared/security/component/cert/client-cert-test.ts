import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ClientCert } from '../../../../../packages/shared/security/component/cert/client-cert';
import { TEST_CERT_PEM, TEST_PRIVATE_KEY_PEM } from './test-cert-fixtures';

describe('ClientCert', () => {

    it('should create defensive copies from input buffers', () => {
        const sourceCert = Buffer.from(TEST_CERT_PEM, 'utf-8');
        const sourceKey = Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8');

        const clientCert = ClientCert.fromBuffers(sourceCert, sourceKey);
        sourceCert.write('X', 0, 'utf-8');
        sourceKey.write('Y', 0, 'utf-8');

        assert.equal(clientCert.certBuffer().toString('utf-8'), TEST_CERT_PEM);
        assert.equal(clientCert.keyBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should return defensive copies from certBuffer and keyBuffer', () => {
        const clientCert = ClientCert.fromBuffers(
            Buffer.from(TEST_CERT_PEM, 'utf-8'),
            Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8'),
        );

        const certBuffer = clientCert.certBuffer();
        const keyBuffer = clientCert.keyBuffer();
        certBuffer.write('X', 0, 'utf-8');
        keyBuffer.write('Y', 0, 'utf-8');

        assert.equal(clientCert.certBuffer().toString('utf-8'), TEST_CERT_PEM);
        assert.equal(clientCert.keyBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should throw when cert buffer is not a certificate', () => {
        assert.throws(
            () => ClientCert.fromBuffers(
                Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8'),
                Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8'),
            ),
            /Invalid client certificate buffer. Expected a valid X\.509 certificate\./,
        );
    });

    it('should throw when key buffer is not a private key', () => {
        assert.throws(
            () => ClientCert.fromBuffers(
                Buffer.from(TEST_CERT_PEM, 'utf-8'),
                Buffer.from(TEST_CERT_PEM, 'utf-8'),
            ),
            /Invalid client private key buffer. Expected a valid private key\./,
        );
    });
});

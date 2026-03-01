import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ClientCert } from '../../../../../packages/shared/security/component/cert/client-cert';

describe('ClientCert', () => {

    it('should create defensive copies from input buffers', () => {
        const sourceCert = Buffer.from('client-cert', 'utf-8');
        const sourceKey = Buffer.from('client-key', 'utf-8');

        const clientCert = ClientCert.fromBuffers(sourceCert, sourceKey);
        sourceCert.write('X', 0, 'utf-8');
        sourceKey.write('Y', 0, 'utf-8');

        assert.equal(clientCert.certBuffer().toString('utf-8'), 'client-cert');
        assert.equal(clientCert.keyBuffer().toString('utf-8'), 'client-key');
    });

    it('should return defensive copies from certBuffer and keyBuffer', () => {
        const clientCert = ClientCert.fromBuffers(
            Buffer.from('client-cert', 'utf-8'),
            Buffer.from('client-key', 'utf-8'),
        );

        const certBuffer = clientCert.certBuffer();
        const keyBuffer = clientCert.keyBuffer();
        certBuffer.write('X', 0, 'utf-8');
        keyBuffer.write('Y', 0, 'utf-8');

        assert.equal(clientCert.certBuffer().toString('utf-8'), 'client-cert');
        assert.equal(clientCert.keyBuffer().toString('utf-8'), 'client-key');
    });
});

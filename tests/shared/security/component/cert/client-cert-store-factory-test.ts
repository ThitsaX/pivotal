import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ClientCertStoreFactory } from '../../../../../packages/shared/security/component/cert/client-cert-store-factory';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('ClientCertStoreFactory', () => {

    it('should create and load store using env mode', () => {
        process.env.CLIENT_CERT_CONTENT = 'client-cert-line1\\nclient-cert-line2';
        process.env.CLIENT_CERT_KEY = 'client-key-line1\\nclient-key-line2';

        const store = ClientCertStoreFactory.create('env');
        const clientCert = store.get();

        assert.ok(clientCert);
        assert.equal(clientCert?.certBuffer().toString('utf-8'), 'client-cert-line1\nclient-cert-line2');
        assert.equal(clientCert?.keyBuffer().toString('utf-8'), 'client-key-line1\nclient-key-line2');
    });

    it('should create and load store using json mode', () => {
        process.env.JSON_CLIENT_CERT = '{"clientCert":"client-cert-line1\\\\nclient-cert-line2","clientKey":"client-key-line1\\\\nclient-key-line2"}';

        const store = ClientCertStoreFactory.create(' JSON ');
        const clientCert = store.get();

        assert.ok(clientCert);
        assert.equal(clientCert?.certBuffer().toString('utf-8'), 'client-cert-line1\nclient-cert-line2');
        assert.equal(clientCert?.keyBuffer().toString('utf-8'), 'client-key-line1\nclient-key-line2');
    });

    it('should throw when mode is unknown', () => {
        assert.throws(
            () => ClientCertStoreFactory.create('unsupported'),
            /Unknown ClientCertStoreFactory mode: 'unsupported'. Supported: 'env', 'json'./,
        );
    });
});

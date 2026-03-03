import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ClientCertStoreFactory } from '../../../../../packages/shared/security/component/cert/client-cert-store-factory';
import { TEST_CERT_ENV_VALUE, TEST_CERT_PEM, TEST_PRIVATE_KEY_ENV_VALUE, TEST_PRIVATE_KEY_PEM } from './test-cert-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('ClientCertStoreFactory', () => {

    it('should create and load store using env mode', () => {
        process.env.CLIENT_CERT_CONTENT = TEST_CERT_ENV_VALUE;
        process.env.CLIENT_CERT_KEY = TEST_PRIVATE_KEY_ENV_VALUE;

        const store = ClientCertStoreFactory.create('env');
        const clientCert = store.get();

        assert.ok(clientCert);
        assert.equal(clientCert?.certBuffer().toString('utf-8'), TEST_CERT_PEM);
        assert.equal(clientCert?.keyBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should create and load store using json mode', () => {
        process.env.JSON_CLIENT_CERT = JSON.stringify({
            clientCert: TEST_CERT_ENV_VALUE,
            clientKey: TEST_PRIVATE_KEY_ENV_VALUE,
        });

        const store = ClientCertStoreFactory.create(' JSON ');
        const clientCert = store.get();

        assert.ok(clientCert);
        assert.equal(clientCert?.certBuffer().toString('utf-8'), TEST_CERT_PEM);
        assert.equal(clientCert?.keyBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should throw when mode is unknown', () => {
        assert.throws(
            () => ClientCertStoreFactory.create('unsupported'),
            /Unknown ClientCertStoreFactory mode: 'unsupported'. Supported: 'env', 'json'./,
        );
    });
});

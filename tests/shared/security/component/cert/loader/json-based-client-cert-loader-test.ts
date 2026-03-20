import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { JsonBasedClientCertStore } from '../../../../../../packages/shared/security/component/cert/store/json-based-client-cert-store';
import { TEST_CERT_ENV_VALUE, TEST_CERT_PEM, TEST_PRIVATE_KEY_ENV_VALUE, TEST_PRIVATE_KEY_PEM } from '../test-cert-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('JsonBasedClientCertStore', () => {

    it('should return undefined when JSON_CLIENT_CERT is missing', () => {
        delete process.env.JSON_CLIENT_CERT;
        const store = new JsonBasedClientCertStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get(), undefined);
    });

    it('should load client cert and key from json environment', () => {
        process.env.JSON_CLIENT_CERT = JSON.stringify({
            clientCert: TEST_CERT_ENV_VALUE,
            clientKey: TEST_PRIVATE_KEY_ENV_VALUE,
        });
        const store = new JsonBasedClientCertStore();

        const loadedStore = store.load();
        const clientCert = store.get();

        assert.equal(loadedStore, store);
        assert.ok(clientCert);
        assert.equal(clientCert?.certBuffer().toString('utf-8'), TEST_CERT_PEM);
        assert.equal(clientCert?.keyBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should throw for non-object source', () => {
        process.env.JSON_CLIENT_CERT = '[]';
        const store = new JsonBasedClientCertStore();

        assert.throws(
            () => store.load(),
            /JSON_CLIENT_CERT must be a JSON object with "clientCert" and "clientKey" fields./,
        );
    });

    it('should throw when clientCert field is missing', () => {
        process.env.JSON_CLIENT_CERT = '{"clientKey":"client-key-line1\\nclient-key-line2"}';
        const store = new JsonBasedClientCertStore();

        assert.throws(
            () => store.load(),
            /JSON_CLIENT_CERT is missing the "clientCert" field./,
        );
    });

    it('should throw when clientKey field is missing', () => {
        process.env.JSON_CLIENT_CERT = '{"clientCert":"client-cert-line1\\nclient-cert-line2"}';
        const store = new JsonBasedClientCertStore();

        assert.throws(
            () => store.load(),
            /JSON_CLIENT_CERT is missing the "clientKey" field./,
        );
    });
});

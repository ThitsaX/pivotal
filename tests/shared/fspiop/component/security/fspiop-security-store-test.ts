import * as assert from 'node:assert/strict';
import {afterEach, describe, it} from 'node:test';
import {FspiopJwsPrivateKeyStore} from '../../../../../packages/shared/fspiop/component/security/fspiop-jws-private-key-store';
import {FspiopJwsPublicKeyStore} from '../../../../../packages/shared/fspiop/component/security/fspiop-jws-public-key-store';
import {FspiopMtlsCaStore} from '../../../../../packages/shared/fspiop/component/security/fspiop-mtls-ca-store';
import {FspiopMtlsClientCertStore} from '../../../../../packages/shared/fspiop/component/security/fspiop-mtls-client-cert-store';
import {TEST_PRIVATE_KEY_ENV_VALUE as TEST_JWS_PRIVATE_KEY_ENV_VALUE, TEST_PRIVATE_KEY_PEM as TEST_JWS_PRIVATE_KEY_PEM, TEST_PUBLIC_KEY_ENV_VALUE, TEST_PUBLIC_KEY_PEM} from '../../../security/component/key/test-key-fixtures';
import {TEST_CERT_ENV_VALUE, TEST_CERT_PEM, TEST_PRIVATE_KEY_ENV_VALUE as TEST_MTLS_PRIVATE_KEY_ENV_VALUE, TEST_PRIVATE_KEY_PEM as TEST_MTLS_PRIVATE_KEY_PEM} from '../../../security/component/cert/test-cert-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('FspiopJwsPublicKeyStore', () => {

    it('should load and return public key by using the fixed env var', () => {
        process.env.FSPIOP_JWS_PUBLIC_KEY = TEST_PUBLIC_KEY_ENV_VALUE;
        const store = new FspiopJwsPublicKeyStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get('any-fsp-id')?.toBuffer().toString('utf-8'), TEST_PUBLIC_KEY_PEM);
    });
});

describe('FspiopJwsPrivateKeyStore', () => {

    it('should load and return private key by using the fixed env var', () => {
        process.env.FSPIOP_JWS_PRIVATE_KEY = TEST_JWS_PRIVATE_KEY_ENV_VALUE;
        const store = new FspiopJwsPrivateKeyStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get('any-fsp-id')?.toBuffer().toString('utf-8'), TEST_JWS_PRIVATE_KEY_PEM);
    });
});

describe('FspiopMtlsCaStore', () => {

    it('should load and return ca buffer by using the fixed env var', () => {
        process.env.FSPIOP_MTLS_CA = TEST_CERT_ENV_VALUE;
        const store = new FspiopMtlsCaStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get()?.toBuffer().toString('utf-8'), TEST_CERT_PEM);
    });
});

describe('FspiopMtlsClientCertStore', () => {

    it('should load and return client cert pair by using the fixed env vars', () => {
        process.env.FSPIOP_MTLS_CLIENT_CERT = TEST_CERT_ENV_VALUE;
        process.env.FSPIOP_MTLS_CLIENT_KEY = TEST_MTLS_PRIVATE_KEY_ENV_VALUE;
        const store = new FspiopMtlsClientCertStore();

        const loadedStore = store.load();
        const clientCert = store.get();

        assert.equal(loadedStore, store);
        assert.equal(clientCert?.certBuffer().toString('utf-8'), TEST_CERT_PEM);
        assert.equal(clientCert?.keyBuffer().toString('utf-8'), TEST_MTLS_PRIVATE_KEY_PEM);
    });
});

import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { EnvBasedCaStore } from '../../../../../../packages/shared/security/component/cert/store/env-based-ca-store';
import { TEST_CERT_ENV_VALUE, TEST_CERT_PEM } from '../test-cert-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('EnvBasedCaStore', () => {

    it('should return empty list when FSPIOP_MTLS_CA_COUNT is missing', () => {
        delete process.env.FSPIOP_MTLS_CA_COUNT;
        const store = new EnvBasedCaStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get(), undefined);
    });

    it('should return empty list when FSPIOP_MTLS_CA_COUNT is invalid', () => {
        process.env.FSPIOP_MTLS_CA_COUNT = 'zero';
        const nonNumberStore = new EnvBasedCaStore();

        const nonNumberLoadedStore = nonNumberStore.load();

        process.env.FSPIOP_MTLS_CA_COUNT = '0';
        const nonPositiveStore = new EnvBasedCaStore();

        const nonPositiveLoadedStore = nonPositiveStore.load();

        assert.equal(nonNumberLoadedStore, nonNumberStore);
        assert.equal(nonPositiveLoadedStore, nonPositiveStore);
        assert.equal(nonNumberStore.get(), undefined);
        assert.equal(nonPositiveStore.get(), undefined);
    });

    it('should load CA certs by count from environment', () => {
        process.env.FSPIOP_MTLS_CA_COUNT = '2';
        process.env.FSPIOP_MTLS_CA_CONTENT_1 = TEST_CERT_ENV_VALUE;
        process.env.FSPIOP_MTLS_CA_CONTENT_2 = TEST_CERT_ENV_VALUE;
        const store = new EnvBasedCaStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get()?.toBuffer().toString('utf-8'), `${TEST_CERT_PEM}${TEST_CERT_PEM}`);
    });

    it('should throw when expected cert variable is missing', () => {
        process.env.FSPIOP_MTLS_CA_COUNT = '2';
        process.env.FSPIOP_MTLS_CA_CONTENT_1 = TEST_CERT_ENV_VALUE;
        delete process.env.FSPIOP_MTLS_CA_CONTENT_2;
        const store = new EnvBasedCaStore();

        assert.throws(
            () => store.load(),
            /Missing CA certificate at 'FSPIOP_MTLS_CA_CONTENT_2'. FSPIOP_MTLS_CA_COUNT is 2 but no content was found for index 2./,
        );
    });
});

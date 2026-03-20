import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { JsonBasedCaStore } from '../../../../../../packages/shared/security/component/cert/store/json-based-ca-store';
import { TEST_CERT_ENV_VALUE, TEST_CERT_PEM } from '../test-cert-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('JsonBasedCaStore', () => {

    it('should return empty list when JSON_CA_CERTS is missing', () => {
        delete process.env.JSON_CA_CERTS;
        const store = new JsonBasedCaStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get(), undefined);
    });

    it('should load certs from json array source', () => {
        process.env.JSON_CA_CERTS = JSON.stringify([TEST_CERT_ENV_VALUE, TEST_CERT_ENV_VALUE]);
        const store = new JsonBasedCaStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get()?.toBuffer().toString('utf-8'), `${TEST_CERT_PEM}${TEST_CERT_PEM}`);
    });

    it('should throw for non-array json source', () => {
        process.env.JSON_CA_CERTS = '{"ca":"line1\\nline2"}';
        const store = new JsonBasedCaStore();

        assert.throws(
            () => store.load(),
            /JSON_CA_CERTS must be a JSON array, e.g. \["CA1_PEM", "CA2_PEM"\]\./,
        );
    });

    it('should throw for blank cert entries', () => {
        process.env.JSON_CA_CERTS = JSON.stringify([TEST_CERT_ENV_VALUE, '   ']);
        const store = new JsonBasedCaStore();

        assert.throws(
            () => store.load(),
            /CA certificate at index 1 must be a non-empty string./,
        );
    });
});

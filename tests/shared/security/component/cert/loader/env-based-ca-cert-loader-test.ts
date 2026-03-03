import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { EnvBasedCaCertLoader } from '../../../../../../packages/shared/security/component/cert/loader/env-based-ca-cert-loader';
import { TEST_CERT_ENV_VALUE, TEST_CERT_PEM } from '../test-cert-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('EnvBasedCaCertLoader', () => {

    it('should return empty list when CA_COUNT is missing', () => {
        delete process.env.CA_COUNT;
        const loader = new EnvBasedCaCertLoader();

        const certs = loader.load();

        assert.equal(certs.length, 0);
    });

    it('should return empty list when CA_COUNT is invalid', () => {
        process.env.CA_COUNT = 'zero';
        const nonNumberLoader = new EnvBasedCaCertLoader();

        const nonNumberCerts = nonNumberLoader.load();

        process.env.CA_COUNT = '0';
        const nonPositiveLoader = new EnvBasedCaCertLoader();

        const nonPositiveCerts = nonPositiveLoader.load();

        assert.equal(nonNumberCerts.length, 0);
        assert.equal(nonPositiveCerts.length, 0);
    });

    it('should load CA certs by count from environment', () => {
        process.env.CA_COUNT = '2';
        process.env.CA_CONTENT_1 = TEST_CERT_ENV_VALUE;
        process.env.CA_CONTENT_2 = TEST_CERT_ENV_VALUE;
        const loader = new EnvBasedCaCertLoader();

        const certs = loader.load();

        assert.equal(certs.length, 2);
        assert.equal(certs[0]?.toBuffer().toString('utf-8'), TEST_CERT_PEM);
        assert.equal(certs[1]?.toBuffer().toString('utf-8'), TEST_CERT_PEM);
    });

    it('should throw when expected cert variable is missing', () => {
        process.env.CA_COUNT = '2';
        process.env.CA_CONTENT_1 = TEST_CERT_ENV_VALUE;
        delete process.env.CA_CONTENT_2;
        const loader = new EnvBasedCaCertLoader();

        assert.throws(
            () => loader.load(),
            /Missing CA certificate at 'CA_CONTENT_2'. CA_COUNT is 2 but no content was found for index 2./,
        );
    });
});

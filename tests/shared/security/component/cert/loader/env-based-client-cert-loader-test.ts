import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { EnvBasedClientCertLoader } from '../../../../../../packages/shared/security/component/cert/loader/env-based-client-cert-loader';
import { TEST_CERT_ENV_VALUE, TEST_CERT_PEM, TEST_PRIVATE_KEY_ENV_VALUE, TEST_PRIVATE_KEY_PEM } from '../test-cert-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('EnvBasedClientCertLoader', () => {

    it('should return undefined when both cert and key are missing', () => {
        delete process.env.CLIENT_CERT_CONTENT;
        delete process.env.CLIENT_CERT_KEY;
        const loader = new EnvBasedClientCertLoader();

        const clientCert = loader.load();

        assert.equal(clientCert, undefined);
    });

    it('should load client cert and key from environment', () => {
        process.env.CLIENT_CERT_CONTENT = TEST_CERT_ENV_VALUE;
        process.env.CLIENT_CERT_KEY = TEST_PRIVATE_KEY_ENV_VALUE;
        const loader = new EnvBasedClientCertLoader();

        const clientCert = loader.load();

        assert.ok(clientCert);
        assert.equal(clientCert?.certBuffer().toString('utf-8'), TEST_CERT_PEM);
        assert.equal(clientCert?.keyBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should throw when cert content is missing', () => {
        delete process.env.CLIENT_CERT_CONTENT;
        process.env.CLIENT_CERT_KEY = TEST_PRIVATE_KEY_ENV_VALUE;
        const loader = new EnvBasedClientCertLoader();

        assert.throws(
            () => loader.load(),
            /CLIENT_CERT_CONTENT is missing. Both CLIENT_CERT_CONTENT and CLIENT_CERT_KEY must be set together./,
        );
    });

    it('should throw when cert key is missing', () => {
        process.env.CLIENT_CERT_CONTENT = TEST_CERT_ENV_VALUE;
        delete process.env.CLIENT_CERT_KEY;
        const loader = new EnvBasedClientCertLoader();

        assert.throws(
            () => loader.load(),
            /CLIENT_CERT_KEY is missing. Both CLIENT_CERT_CONTENT and CLIENT_CERT_KEY must be set together./,
        );
    });
});

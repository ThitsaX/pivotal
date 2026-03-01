import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { JsonBasedClientCertLoader } from '../../../../../../packages/shared/security/component/cert/loader/json-based-client-cert-loader';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('JsonBasedClientCertLoader', () => {

    it('should return undefined when JSON_CLIENT_CERT is missing', () => {
        delete process.env.JSON_CLIENT_CERT;
        const loader = new JsonBasedClientCertLoader();

        const clientCert = loader.load();

        assert.equal(clientCert, undefined);
    });

    it('should load client cert and key from json environment', () => {
        process.env.JSON_CLIENT_CERT = '{"clientCert":"client-cert-line1\\\\nclient-cert-line2","clientKey":"client-key-line1\\\\nclient-key-line2"}';
        const loader = new JsonBasedClientCertLoader();

        const clientCert = loader.load();

        assert.ok(clientCert);
        assert.equal(clientCert?.certBuffer().toString('utf-8'), 'client-cert-line1\nclient-cert-line2');
        assert.equal(clientCert?.keyBuffer().toString('utf-8'), 'client-key-line1\nclient-key-line2');
    });

    it('should throw for non-object source', () => {
        process.env.JSON_CLIENT_CERT = '[]';
        const loader = new JsonBasedClientCertLoader();

        assert.throws(
            () => loader.load(),
            /JSON_CLIENT_CERT must be a JSON object with "clientCert" and "clientKey" fields./,
        );
    });

    it('should throw when clientCert field is missing', () => {
        process.env.JSON_CLIENT_CERT = '{"clientKey":"client-key-line1\\\\nclient-key-line2"}';
        const loader = new JsonBasedClientCertLoader();

        assert.throws(
            () => loader.load(),
            /JSON_CLIENT_CERT is missing the "clientCert" field./,
        );
    });

    it('should throw when clientKey field is missing', () => {
        process.env.JSON_CLIENT_CERT = '{"clientCert":"client-cert-line1\\\\nclient-cert-line2"}';
        const loader = new JsonBasedClientCertLoader();

        assert.throws(
            () => loader.load(),
            /JSON_CLIENT_CERT is missing the "clientKey" field./,
        );
    });
});

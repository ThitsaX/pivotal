import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { JsonBasedCaCertLoader } from '../../../../../../packages/shared/security/component/cert/loader/json-based-ca-cert-loader';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('JsonBasedCaCertLoader', () => {

    it('should return empty list when JSON_CA_CERTS is missing', () => {
        delete process.env.JSON_CA_CERTS;
        const loader = new JsonBasedCaCertLoader();

        const certs = loader.load();

        assert.equal(certs.length, 0);
    });

    it('should load certs from json array source', () => {
        process.env.JSON_CA_CERTS = '["line1\\\\nline2","line3\\\\nline4"]';
        const loader = new JsonBasedCaCertLoader();

        const certs = loader.load();

        assert.equal(certs.length, 2);
        assert.equal(certs[0]?.toBuffer().toString('utf-8'), 'line1\nline2');
        assert.equal(certs[1]?.toBuffer().toString('utf-8'), 'line3\nline4');
    });

    it('should throw for non-array json source', () => {
        process.env.JSON_CA_CERTS = '{"ca":"line1\\\\nline2"}';
        const loader = new JsonBasedCaCertLoader();

        assert.throws(
            () => loader.load(),
            /JSON_CA_CERTS must be a JSON array, e.g. \["CA1_PEM", "CA2_PEM"\]./,
        );
    });

    it('should throw for blank cert entries', () => {
        process.env.JSON_CA_CERTS = '["line1\\\\nline2","   "]';
        const loader = new JsonBasedCaCertLoader();

        assert.throws(
            () => loader.load(),
            /CA certificate at index 1 must be a non-empty string./,
        );
    });
});

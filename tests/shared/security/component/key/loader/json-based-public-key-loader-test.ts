import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { JsonBasedPublicKeyLoader } from '../../../../../../packages/shared/security/component/key/loader/json-based-public-key-loader';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('JsonBasedPublicKeyLoader', () => {

    it('should load keys from json source', () => {
        process.env.JSON_PUBLIC_KEYS = '{"fsp-a":"line1\\\\nline2","fsp-b":"line3\\\\nline4"}';
        const loader = new JsonBasedPublicKeyLoader();

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 2);
        assert.equal(keysByFspId.get('fsp-a')?.toBuffer().toString('utf-8'), 'line1\nline2');
        assert.equal(keysByFspId.get('fsp-b')?.toBuffer().toString('utf-8'), 'line3\nline4');
    });

    it('should return empty map when JSON_PUBLIC_KEYS is missing', () => {
        delete process.env.JSON_PUBLIC_KEYS;
        const loader = new JsonBasedPublicKeyLoader();

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 0);
    });

    it('should skip blank fsp ids', () => {
        process.env.JSON_PUBLIC_KEYS = '{"   ":"line1\\\\nline2","fsp-a":"line3\\\\nline4"}';
        const loader = new JsonBasedPublicKeyLoader();

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 1);
        assert.equal(keysByFspId.has('fsp-a'), true);
    });

    it('should throw for non-object json source', () => {
        process.env.JSON_PUBLIC_KEYS = '[]';
        const loader = new JsonBasedPublicKeyLoader();

        assert.throws(() => loader.load(), /JSON_PUBLIC_KEYS must be a JSON object./);
    });

    it('should throw for blank key values', () => {
        process.env.JSON_PUBLIC_KEYS = '{"fsp-a":"   "}';
        const loader = new JsonBasedPublicKeyLoader();

        assert.throws(() => loader.load(), /Public key for 'fsp-a' must be a non-empty string\./);
    });
});

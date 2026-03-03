import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { JsonBasedPublicKeyLoader } from '../../../../../../packages/shared/security/component/key/loader/json-based-public-key-loader';
import { TEST_PUBLIC_KEY_ENV_VALUE, TEST_PUBLIC_KEY_PEM } from '../test-key-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('JsonBasedPublicKeyLoader', () => {

    it('should load keys from json source', () => {
        process.env.JSON_PUBLIC_KEYS = JSON.stringify({
            'fsp-a': TEST_PUBLIC_KEY_ENV_VALUE,
            'fsp-b': TEST_PUBLIC_KEY_ENV_VALUE,
        });
        const loader = new JsonBasedPublicKeyLoader();

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 2);
        assert.equal(keysByFspId.get('fsp-a')?.toBuffer().toString('utf-8'), TEST_PUBLIC_KEY_PEM);
        assert.equal(keysByFspId.get('fsp-b')?.toBuffer().toString('utf-8'), TEST_PUBLIC_KEY_PEM);
    });

    it('should return empty map when JSON_PUBLIC_KEYS is missing', () => {
        delete process.env.JSON_PUBLIC_KEYS;
        const loader = new JsonBasedPublicKeyLoader();

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 0);
    });

    it('should skip blank fsp ids', () => {
        process.env.JSON_PUBLIC_KEYS = JSON.stringify({
            '   ': TEST_PUBLIC_KEY_ENV_VALUE,
            'fsp-a': TEST_PUBLIC_KEY_ENV_VALUE,
        });
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

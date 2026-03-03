import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { JsonBasedPrivateKeyLoader } from '../../../../../../packages/shared/security/component/key/loader/json-based-private-key-loader';
import { TEST_PRIVATE_KEY_ENV_VALUE, TEST_PRIVATE_KEY_PEM } from '../test-key-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('JsonBasedPrivateKeyLoader', () => {

    it('should load keys from json source', () => {
        process.env.JSON_PRIVATE_KEYS = JSON.stringify({
            'fsp-a': TEST_PRIVATE_KEY_ENV_VALUE,
            'fsp-b': TEST_PRIVATE_KEY_ENV_VALUE,
        });
        const loader = new JsonBasedPrivateKeyLoader();

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 2);
        assert.equal(keysByFspId.get('fsp-a')?.toBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
        assert.equal(keysByFspId.get('fsp-b')?.toBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should return empty map when JSON_PRIVATE_KEYS is missing', () => {
        delete process.env.JSON_PRIVATE_KEYS;
        const loader = new JsonBasedPrivateKeyLoader();

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 0);
    });

    it('should skip blank fsp ids', () => {
        process.env.JSON_PRIVATE_KEYS = JSON.stringify({
            '   ': TEST_PRIVATE_KEY_ENV_VALUE,
            'fsp-a': TEST_PRIVATE_KEY_ENV_VALUE,
        });
        const loader = new JsonBasedPrivateKeyLoader();

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 1);
        assert.equal(keysByFspId.has('fsp-a'), true);
    });

    it('should throw for non-object json source', () => {
        process.env.JSON_PRIVATE_KEYS = '[]';
        const loader = new JsonBasedPrivateKeyLoader();

        assert.throws(() => loader.load(), /JSON_PRIVATE_KEYS must be a JSON object./);
    });

    it('should throw for blank key values', () => {
        process.env.JSON_PRIVATE_KEYS = '{"fsp-a":"   "}';
        const loader = new JsonBasedPrivateKeyLoader();

        assert.throws(() => loader.load(), /Private key for 'fsp-a' must be a non-empty string\./);
    });
});

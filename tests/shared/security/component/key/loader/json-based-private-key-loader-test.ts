import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { JsonBasedPrivateKeyStore } from '../../../../../../packages/shared/security/component/key/store/json-based-private-key-store';
import { TEST_PRIVATE_KEY_ENV_VALUE, TEST_PRIVATE_KEY_PEM } from '../test-key-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('JsonBasedPrivateKeyStore', () => {

    it('should load keys from json source', () => {
        process.env.JSON_PRIVATE_KEYS = JSON.stringify({
            'fsp-a': TEST_PRIVATE_KEY_ENV_VALUE,
            'fsp-b': TEST_PRIVATE_KEY_ENV_VALUE,
        });
        const store = new JsonBasedPrivateKeyStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get('fsp-a')?.toBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
        assert.equal(store.get('fsp-b')?.toBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should return empty map when JSON_PRIVATE_KEYS is missing', () => {
        delete process.env.JSON_PRIVATE_KEYS;
        const store = new JsonBasedPrivateKeyStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get('fsp-a'), undefined);
    });

    it('should skip blank fsp ids', () => {
        process.env.JSON_PRIVATE_KEYS = JSON.stringify({
            '   ': TEST_PRIVATE_KEY_ENV_VALUE,
            'fsp-a': TEST_PRIVATE_KEY_ENV_VALUE,
        });
        const store = new JsonBasedPrivateKeyStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get('fsp-a') != null, true);
    });

    it('should throw for non-object json source', () => {
        process.env.JSON_PRIVATE_KEYS = '[]';
        const store = new JsonBasedPrivateKeyStore();

        assert.throws(() => store.load(), /JSON_PRIVATE_KEYS must be a JSON object./);
    });

    it('should throw for blank key values', () => {
        process.env.JSON_PRIVATE_KEYS = '{"fsp-a":"   "}';
        const store = new JsonBasedPrivateKeyStore();

        assert.throws(() => store.load(), /Private key for 'fsp-a' must be a non-empty string\./);
    });
});

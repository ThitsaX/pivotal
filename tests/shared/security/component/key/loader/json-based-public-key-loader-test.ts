import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { JsonBasedPublicKeyStore } from '../../../../../../packages/shared/security/component/key/store/json-based-public-key-store';
import { TEST_PUBLIC_KEY_ENV_VALUE, TEST_PUBLIC_KEY_PEM } from '../test-key-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('JsonBasedPublicKeyStore', () => {

    it('should load keys from json source', () => {
        process.env.JSON_PUBLIC_KEYS = JSON.stringify({
            'fsp-a': TEST_PUBLIC_KEY_ENV_VALUE,
            'fsp-b': TEST_PUBLIC_KEY_ENV_VALUE,
        });
        const store = new JsonBasedPublicKeyStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get('fsp-a')?.toBuffer().toString('utf-8'), TEST_PUBLIC_KEY_PEM);
        assert.equal(store.get('fsp-b')?.toBuffer().toString('utf-8'), TEST_PUBLIC_KEY_PEM);
    });

    it('should return empty map when JSON_PUBLIC_KEYS is missing', () => {
        delete process.env.JSON_PUBLIC_KEYS;
        const store = new JsonBasedPublicKeyStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get('fsp-a'), undefined);
    });

    it('should skip blank fsp ids', () => {
        process.env.JSON_PUBLIC_KEYS = JSON.stringify({
            '   ': TEST_PUBLIC_KEY_ENV_VALUE,
            'fsp-a': TEST_PUBLIC_KEY_ENV_VALUE,
        });
        const store = new JsonBasedPublicKeyStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get('fsp-a') != null, true);
    });

    it('should throw for non-object json source', () => {
        process.env.JSON_PUBLIC_KEYS = '[]';
        const store = new JsonBasedPublicKeyStore();

        assert.throws(() => store.load(), /JSON_PUBLIC_KEYS must be a JSON object./);
    });

    it('should throw for blank key values', () => {
        process.env.JSON_PUBLIC_KEYS = '{"fsp-a":"   "}';
        const store = new JsonBasedPublicKeyStore();

        assert.throws(() => store.load(), /Public key for 'fsp-a' must be a non-empty string\./);
    });
});

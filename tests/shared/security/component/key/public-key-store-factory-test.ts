import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { PublicKeyStoreFactory } from '../../../../../packages/shared/security/component/key/public-key-store-factory';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('PublicKeyStoreFactory', () => {

    it('should create and load store using env mode', () => {
        process.env.FSP_IDS = 'fsp-a, fsp-b';
        process.env['PUBLIC_KEY_FSP-A'] = 'line1\\nline2';
        process.env['PUBLIC_KEY_FSP-B'] = 'line3\\nline4';

        const store = PublicKeyStoreFactory.create('env');

        assert.equal(store.has('fsp-a'), true);
        assert.equal(store.has('fsp-b'), true);
        assert.equal(store.getBuffer('fsp-a')?.toString('utf-8'), 'line1\nline2');
        assert.equal(store.getBuffer('fsp-b')?.toString('utf-8'), 'line3\nline4');
    });

    it('should create and load store using json mode', () => {
        process.env.JSON_PUBLIC_KEYS = '{"fsp-a":"line1\\\\nline2","fsp-b":"line3\\\\nline4"}';

        const store = PublicKeyStoreFactory.create(' JSON ');

        assert.equal(store.has('fsp-a'), true);
        assert.equal(store.has('fsp-b'), true);
        assert.equal(store.getBuffer('fsp-a')?.toString('utf-8'), 'line1\nline2');
        assert.equal(store.getBuffer('fsp-b')?.toString('utf-8'), 'line3\nline4');
    });

    it('should throw when mode is unknown', () => {
        assert.throws(
            () => PublicKeyStoreFactory.create('unsupported'),
            /Unknown PublicKeyStoreFactory mode: 'unsupported'. Supported: 'env', 'json'./,
        );
    });
});

import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { PublicKeyStoreFactory } from '../../../../../packages/shared/security/component/key/public-key-store-factory';
import { TEST_PUBLIC_KEY_ENV_VALUE, TEST_PUBLIC_KEY_PEM } from './test-key-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('PublicKeyStoreFactory', () => {

    it('should create and load store using env mode', () => {
        process.env.FSPIOP_FSP_IDS = 'fsp-a, fsp-b';
        process.env['FSPIOP_JWS_PUBLIC_KEY_FSP-A'] = TEST_PUBLIC_KEY_ENV_VALUE;
        process.env['FSPIOP_JWS_PUBLIC_KEY_FSP-B'] = TEST_PUBLIC_KEY_ENV_VALUE;

        const store = PublicKeyStoreFactory.create('env');

        assert.equal(store.has('fsp-a'), true);
        assert.equal(store.has('fsp-b'), true);
        assert.equal(store.getBuffer('fsp-a')?.toString('utf-8'), TEST_PUBLIC_KEY_PEM);
        assert.equal(store.getBuffer('fsp-b')?.toString('utf-8'), TEST_PUBLIC_KEY_PEM);
    });

    it('should create and load store using json mode', () => {
        process.env.JSON_PUBLIC_KEYS = JSON.stringify({
            'fsp-a': TEST_PUBLIC_KEY_ENV_VALUE,
            'fsp-b': TEST_PUBLIC_KEY_ENV_VALUE,
        });

        const store = PublicKeyStoreFactory.create(' JSON ');

        assert.equal(store.has('fsp-a'), true);
        assert.equal(store.has('fsp-b'), true);
        assert.equal(store.getBuffer('fsp-a')?.toString('utf-8'), TEST_PUBLIC_KEY_PEM);
        assert.equal(store.getBuffer('fsp-b')?.toString('utf-8'), TEST_PUBLIC_KEY_PEM);
    });

    it('should throw when mode is unknown', () => {
        assert.throws(
            () => PublicKeyStoreFactory.create('unsupported'),
            /Unknown PublicKeyStoreFactory mode: 'unsupported'. Supported: 'env', 'json'./,
        );
    });
});

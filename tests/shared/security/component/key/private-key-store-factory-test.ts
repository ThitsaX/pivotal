import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { PrivateKeyStoreFactory } from '../../../../../packages/shared/security/component/key/private-key-store-factory';
import { TEST_PRIVATE_KEY_ENV_VALUE, TEST_PRIVATE_KEY_PEM } from './test-key-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('PrivateKeyStoreFactory', () => {

    it('should create and load store using env mode', () => {
        process.env.FSPIOP_FSP_IDS = 'fsp-a, fsp-b';
        process.env['FSPIOP_JWS_PRIVATE_KEY_FSP-A'] = TEST_PRIVATE_KEY_ENV_VALUE;
        process.env['FSPIOP_JWS_PRIVATE_KEY_FSP-B'] = TEST_PRIVATE_KEY_ENV_VALUE;

        const store = PrivateKeyStoreFactory.create('env');

        assert.equal(store.has('fsp-a'), true);
        assert.equal(store.has('fsp-b'), true);
        assert.equal(store.getBuffer('fsp-a')?.toString('utf-8'), TEST_PRIVATE_KEY_PEM);
        assert.equal(store.getBuffer('fsp-b')?.toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should create and load store using json mode', () => {
        process.env.JSON_PRIVATE_KEYS = JSON.stringify({
            'fsp-a': TEST_PRIVATE_KEY_ENV_VALUE,
            'fsp-b': TEST_PRIVATE_KEY_ENV_VALUE,
        });

        const store = PrivateKeyStoreFactory.create(' JSON ');

        assert.equal(store.has('fsp-a'), true);
        assert.equal(store.has('fsp-b'), true);
        assert.equal(store.getBuffer('fsp-a')?.toString('utf-8'), TEST_PRIVATE_KEY_PEM);
        assert.equal(store.getBuffer('fsp-b')?.toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should throw when mode is unknown', () => {
        assert.throws(
            () => PrivateKeyStoreFactory.create('unsupported'),
            /Unknown PrivateKeyStoreFactory mode: 'unsupported'. Supported: 'env', 'json'./,
        );
    });
});

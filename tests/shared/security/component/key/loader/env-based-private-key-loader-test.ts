import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { EnvBasedPrivateKeyStore } from '../../../../../../packages/shared/security/component/key/store/env-based-private-key-store';
import { TEST_PRIVATE_KEY_ENV_VALUE, TEST_PRIVATE_KEY_PEM } from '../test-key-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('EnvBasedPrivateKeyStore', () => {

    it('should return empty map when FSPIOP_FSP_IDS is missing', () => {
        delete process.env.FSPIOP_FSP_IDS;
        const store = new EnvBasedPrivateKeyStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get('fsp-a'), undefined);
    });

    it('should load private keys by FSP ids from environment', () => {
        process.env.FSPIOP_FSP_IDS = 'fsp-a, fsp-b';
        process.env['FSPIOP_JWS_PRIVATE_KEY_FSP-A'] = TEST_PRIVATE_KEY_ENV_VALUE;
        process.env['FSPIOP_JWS_PRIVATE_KEY_FSP-B'] = TEST_PRIVATE_KEY_ENV_VALUE;
        const store = new EnvBasedPrivateKeyStore();

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get('fsp-a')?.toBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
        assert.equal(store.get('fsp-b')?.toBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should throw when expected key variable is missing', () => {
        process.env.FSPIOP_FSP_IDS = 'fsp-a';
        delete process.env['FSPIOP_JWS_PRIVATE_KEY_FSP-A'];
        const store = new EnvBasedPrivateKeyStore();

        assert.throws(
            () => store.load(),
            /Missing private key for 'fsp-a'. Expected env var 'FSPIOP_JWS_PRIVATE_KEY_FSP-A'./,
        );
    });
});

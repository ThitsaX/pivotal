import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { EnvBasedPrivateKeyLoader } from '../../../../../../packages/shared/security/component/key/loader/env-based-private-key-loader';
import { TEST_PRIVATE_KEY_ENV_VALUE, TEST_PRIVATE_KEY_PEM } from '../test-key-fixtures';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('EnvBasedPrivateKeyLoader', () => {

    it('should return empty map when FSP_IDS is missing', () => {
        delete process.env.FSP_IDS;
        const loader = new EnvBasedPrivateKeyLoader();

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 0);
    });

    it('should load private keys by FSP ids from environment', () => {
        process.env.FSP_IDS = 'fsp-a, fsp-b';
        process.env['PRIVATE_KEY_FSP-A'] = TEST_PRIVATE_KEY_ENV_VALUE;
        process.env['PRIVATE_KEY_FSP-B'] = TEST_PRIVATE_KEY_ENV_VALUE;
        const loader = new EnvBasedPrivateKeyLoader();

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 2);
        assert.equal(keysByFspId.get('fsp-a')?.toBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
        assert.equal(keysByFspId.get('fsp-b')?.toBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should throw when expected key variable is missing', () => {
        process.env.FSP_IDS = 'fsp-a';
        delete process.env['PRIVATE_KEY_FSP-A'];
        const loader = new EnvBasedPrivateKeyLoader();

        assert.throws(
            () => loader.load(),
            /Missing private key for 'fsp-a'. Expected env var 'PRIVATE_KEY_FSP-A'./,
        );
    });
});

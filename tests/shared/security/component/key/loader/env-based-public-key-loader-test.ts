import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { EnvBasedPublicKeyLoader } from '../../../../../../packages/shared/security/component/key/loader/env-based-public-key-loader';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('EnvBasedPublicKeyLoader', () => {

    it('should return empty map when FSP_IDS is missing', () => {
        delete process.env.FSP_IDS;
        const loader = new EnvBasedPublicKeyLoader();

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 0);
    });

    it('should load public keys by FSP ids from environment', () => {
        process.env.FSP_IDS = 'fsp-a, fsp-b';
        process.env['PUBLIC_KEY_FSP-A'] = 'line1\\nline2';
        process.env['PUBLIC_KEY_FSP-B'] = 'line3\\nline4';
        const loader = new EnvBasedPublicKeyLoader();

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 2);
        assert.equal(keysByFspId.get('fsp-a')?.toBuffer().toString('utf-8'), 'line1\nline2');
        assert.equal(keysByFspId.get('fsp-b')?.toBuffer().toString('utf-8'), 'line3\nline4');
    });

    it('should throw when expected key variable is missing', () => {
        process.env.FSP_IDS = 'fsp-a';
        delete process.env['PUBLIC_KEY_FSP-A'];
        const loader = new EnvBasedPublicKeyLoader();

        assert.throws(
            () => loader.load(),
            /Missing public key for 'fsp-a'. Expected env var 'PUBLIC_KEY_FSP-A'./,
        );
    });
});

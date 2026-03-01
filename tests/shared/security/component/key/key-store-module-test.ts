import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Test } from '@nestjs/testing';
import { KeyStoreModule } from '../../../../../packages/shared/security/component/key/key-store.module';
import { PrivateKeyStore } from '../../../../../packages/shared/security/component/key/private-key-store';
import { PublicKeyStore } from '../../../../../packages/shared/security/component/key/public-key-store';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('KeyStoreModule', () => {

    it('should provide key stores via default env mode', async () => {
        process.env.FSP_IDS = 'fsp-a';
        process.env['PUBLIC_KEY_FSP-A'] = 'public-line1\\npublic-line2';
        process.env['PRIVATE_KEY_FSP-A'] = 'private-line1\\nprivate-line2';

        const testingModule = await Test.createTestingModule({
            imports: [KeyStoreModule],
        }).compile();

        const publicKeyStore = testingModule.get(PublicKeyStore);
        const privateKeyStore = testingModule.get(PrivateKeyStore);

        assert.ok(publicKeyStore);
        assert.ok(privateKeyStore);
        assert.equal(publicKeyStore.getBuffer('fsp-a')?.toString('utf-8'), 'public-line1\npublic-line2');
        assert.equal(privateKeyStore.getBuffer('fsp-a')?.toString('utf-8'), 'private-line1\nprivate-line2');
    });

    it('should provide key stores via json mode', async () => {
        process.env.PUBLIC_KEY_STORE_FACTORY = 'json';
        process.env.PRIVATE_KEY_STORE_FACTORY = 'json';
        process.env.JSON_PUBLIC_KEYS = '{"fsp-a":"public-line1\\\\npublic-line2"}';
        process.env.JSON_PRIVATE_KEYS = '{"fsp-a":"private-line1\\\\nprivate-line2"}';

        const testingModule = await Test.createTestingModule({
            imports: [KeyStoreModule],
        }).compile();

        const publicKeyStore = testingModule.get(PublicKeyStore);
        const privateKeyStore = testingModule.get(PrivateKeyStore);

        assert.equal(publicKeyStore.getBuffer('fsp-a')?.toString('utf-8'), 'public-line1\npublic-line2');
        assert.equal(privateKeyStore.getBuffer('fsp-a')?.toString('utf-8'), 'private-line1\nprivate-line2');
    });

    it('should fail for unsupported public key store mode', async () => {
        process.env.PUBLIC_KEY_STORE_FACTORY = 'unsupported';

        await assert.rejects(
            async () => Test.createTestingModule({ imports: [KeyStoreModule] }).compile(),
            /Unknown PublicKeyStoreFactory mode: 'unsupported'. Supported: 'env', 'json'./,
        );
    });

    it('should fail for unsupported private key store mode', async () => {
        process.env.FSP_IDS = 'fsp-a';
        process.env['PUBLIC_KEY_FSP-A'] = 'public-line1\\npublic-line2';
        process.env.PRIVATE_KEY_STORE_FACTORY = 'unsupported';

        await assert.rejects(
            async () => Test.createTestingModule({ imports: [KeyStoreModule] }).compile(),
            /Unknown PrivateKeyStoreFactory mode: 'unsupported'. Supported: 'env', 'json'./,
        );
    });
});

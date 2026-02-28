import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Test } from '@nestjs/testing';
import { EnvBasedPrivateKeyLoader } from '../../../../../packages/shared/security/component/key/loader/env-based-private-key-loader';
import { EnvBasedPublicKeyLoader } from '../../../../../packages/shared/security/component/key/loader/env-based-public-key-loader';
import { JsonBasedPrivateKeyLoader } from '../../../../../packages/shared/security/component/key/loader/json-based-private-key-loader';
import { JsonBasedPublicKeyLoader } from '../../../../../packages/shared/security/component/key/loader/json-based-public-key-loader';
import { KeystoreModule } from '../../../../../packages/shared/security/component/key/keystore.module';
import { PrivateKeyStore } from '../../../../../packages/shared/security/component/key/private-key-store';
import { PublicKeyStore } from '../../../../../packages/shared/security/component/key/public-key-store';

describe('KeystoreModule', () => {

    it('should provide keystore services', async () => {
        const testingModule = await Test.createTestingModule({
            imports: [KeystoreModule],
        }).compile();

        const publicKeyStore = testingModule.get(PublicKeyStore);
        const privateKeyStore = testingModule.get(PrivateKeyStore);
        const envBasedPublicKeyLoader = testingModule.get(EnvBasedPublicKeyLoader);
        const jsonBasedPublicKeyLoader = testingModule.get(JsonBasedPublicKeyLoader);
        const envBasedPrivateKeyLoader = testingModule.get(EnvBasedPrivateKeyLoader);
        const jsonBasedPrivateKeyLoader = testingModule.get(JsonBasedPrivateKeyLoader);

        assert.ok(publicKeyStore);
        assert.ok(privateKeyStore);
        assert.ok(envBasedPublicKeyLoader);
        assert.ok(jsonBasedPublicKeyLoader);
        assert.ok(envBasedPrivateKeyLoader);
        assert.ok(jsonBasedPrivateKeyLoader);
    });
});

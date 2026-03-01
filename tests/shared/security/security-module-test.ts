import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Test } from '@nestjs/testing';
import { CaStore } from '../../../packages/shared/security/component/cert/ca-store';
import { ClientCertStore } from '../../../packages/shared/security/component/cert/client-cert-store';
import { PrivateKeyStore } from '../../../packages/shared/security/component/key/private-key-store';
import { PublicKeyStore } from '../../../packages/shared/security/component/key/public-key-store';
import { SecurityModule } from '../../../packages/shared/security/security.module';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('SecurityModule', () => {

    it('should export key and cert store services through security module', async () => {
        process.env.FSP_IDS = 'fsp-a';
        process.env['PUBLIC_KEY_FSP-A'] = 'public-line1\\npublic-line2';
        process.env['PRIVATE_KEY_FSP-A'] = 'private-line1\\nprivate-line2';
        process.env.CA_COUNT = '2';
        process.env.CA_CONTENT_1 = 'ca-line1\\nca-line2\\n';
        process.env.CA_CONTENT_2 = 'ca-line3\\nca-line4\\n';
        process.env.CLIENT_CERT_CONTENT = 'client-cert-line1\\nclient-cert-line2';
        process.env.CLIENT_CERT_KEY = 'client-key-line1\\nclient-key-line2';

        const testingModule = await Test.createTestingModule({
            imports: [SecurityModule],
        }).compile();

        const publicKeyStore = testingModule.get(PublicKeyStore);
        const privateKeyStore = testingModule.get(PrivateKeyStore);
        const caStore = testingModule.get(CaStore);
        const clientCertStore = testingModule.get(ClientCertStore);
        const clientCert = clientCertStore.get();

        assert.ok(publicKeyStore);
        assert.ok(privateKeyStore);
        assert.ok(caStore);
        assert.ok(clientCertStore);
        assert.equal(publicKeyStore.getBuffer('fsp-a')?.toString('utf-8'), 'public-line1\npublic-line2');
        assert.equal(privateKeyStore.getBuffer('fsp-a')?.toString('utf-8'), 'private-line1\nprivate-line2');
        assert.equal(caStore.toBuffer()?.toString('utf-8'), 'ca-line1\nca-line2\nca-line3\nca-line4\n');
        assert.equal(clientCert?.certBuffer().toString('utf-8'), 'client-cert-line1\nclient-cert-line2');
        assert.equal(clientCert?.keyBuffer().toString('utf-8'), 'client-key-line1\nclient-key-line2');
    });
});

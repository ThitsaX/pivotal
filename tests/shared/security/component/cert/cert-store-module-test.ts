import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Test } from '@nestjs/testing';
import { CaStore } from '../../../../../packages/shared/security/component/cert/ca-store';
import { CertStoreModule } from '../../../../../packages/shared/security/component/cert/cert-store.module';
import { ClientCertStore } from '../../../../../packages/shared/security/component/cert/client-cert-store';
import { EnvBasedCaCertLoader } from '../../../../../packages/shared/security/component/cert/loader/env-based-ca-cert-loader';
import { EnvBasedClientCertLoader } from '../../../../../packages/shared/security/component/cert/loader/env-based-client-cert-loader';
import { JsonBasedCaCertLoader } from '../../../../../packages/shared/security/component/cert/loader/json-based-ca-cert-loader';
import { JsonBasedClientCertLoader } from '../../../../../packages/shared/security/component/cert/loader/json-based-client-cert-loader';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('CertStoreModule', () => {

    it('should provide ca store and client cert store via default env mode', async () => {
        process.env.CA_COUNT = '2';
        process.env.CA_CONTENT_1 = 'ca-line1\\nca-line2\\n';
        process.env.CA_CONTENT_2 = 'ca-line3\\nca-line4\\n';
        process.env.CLIENT_CERT_CONTENT = 'client-cert-line1\\nclient-cert-line2';
        process.env.CLIENT_CERT_KEY = 'client-key-line1\\nclient-key-line2';

        const testingModule = await Test.createTestingModule({
            imports: [CertStoreModule],
        }).compile();

        const caStore = testingModule.get(CaStore);
        const clientCertStore = testingModule.get(ClientCertStore);
        const envBasedCaCertLoader = testingModule.get(EnvBasedCaCertLoader);
        const jsonBasedCaCertLoader = testingModule.get(JsonBasedCaCertLoader);
        const envBasedClientCertLoader = testingModule.get(EnvBasedClientCertLoader);
        const jsonBasedClientCertLoader = testingModule.get(JsonBasedClientCertLoader);
        const clientCert = clientCertStore.get();

        assert.ok(caStore);
        assert.ok(clientCertStore);
        assert.ok(envBasedCaCertLoader);
        assert.ok(jsonBasedCaCertLoader);
        assert.ok(envBasedClientCertLoader);
        assert.ok(jsonBasedClientCertLoader);
        assert.equal(caStore.toBuffer()?.toString('utf-8'), 'ca-line1\nca-line2\nca-line3\nca-line4\n');
        assert.equal(clientCert?.certBuffer().toString('utf-8'), 'client-cert-line1\nclient-cert-line2');
        assert.equal(clientCert?.keyBuffer().toString('utf-8'), 'client-key-line1\nclient-key-line2');
    });

    it('should provide ca store and client cert store via json mode', async () => {
        process.env.CA_CERT_STORE_FACTORY = 'json';
        process.env.CLIENT_CERT_STORE_FACTORY = 'json';
        process.env.JSON_CA_CERTS = '["ca-line1\\\\nca-line2\\\\n","ca-line3\\\\nca-line4\\\\n"]';
        process.env.JSON_CLIENT_CERT = '{"clientCert":"client-cert-line1\\\\nclient-cert-line2","clientKey":"client-key-line1\\\\nclient-key-line2"}';

        const testingModule = await Test.createTestingModule({
            imports: [CertStoreModule],
        }).compile();

        const caStore = testingModule.get(CaStore);
        const clientCertStore = testingModule.get(ClientCertStore);
        const clientCert = clientCertStore.get();

        assert.equal(caStore.toBuffer()?.toString('utf-8'), 'ca-line1\nca-line2\nca-line3\nca-line4\n');
        assert.equal(clientCert?.certBuffer().toString('utf-8'), 'client-cert-line1\nclient-cert-line2');
        assert.equal(clientCert?.keyBuffer().toString('utf-8'), 'client-key-line1\nclient-key-line2');
    });

    it('should fail for unsupported ca store mode', async () => {
        process.env.CA_CERT_STORE_FACTORY = 'unsupported';

        await assert.rejects(
            async () => Test.createTestingModule({ imports: [CertStoreModule] }).compile(),
            /Unknown CaStoreFactory mode: 'unsupported'. Supported: 'env', 'json'./,
        );
    });

    it('should fail for unsupported client cert store mode', async () => {
        process.env.CLIENT_CERT_STORE_FACTORY = 'unsupported';

        await assert.rejects(
            async () => Test.createTestingModule({ imports: [CertStoreModule] }).compile(),
            /Unknown ClientCertStoreFactory mode: 'unsupported'. Supported: 'env', 'json'./,
        );
    });
});

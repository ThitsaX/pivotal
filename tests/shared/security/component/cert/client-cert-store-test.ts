import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ClientCert } from '../../../../../packages/shared/security/component/cert/client-cert';
import { ClientCertLoader } from '../../../../../packages/shared/security/component/cert/client-cert-loader';
import { ClientCertStore } from '../../../../../packages/shared/security/component/cert/client-cert-store';
import { TEST_CERT_PEM, TEST_PRIVATE_KEY_PEM } from './test-cert-fixtures';

class StubClientCertLoader extends ClientCertLoader {

    private readonly clientCert: ClientCert | undefined;

    constructor(clientCert: ClientCert | undefined) {
        super();
        this.clientCert = clientCert;
    }

    load(): ClientCert | undefined {
        return this.clientCert;
    }
}

describe('ClientCertStore', () => {

    it('should load and return client cert pair', () => {
        const source = ClientCert.fromBuffers(
            Buffer.from(TEST_CERT_PEM, 'utf-8'),
            Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8'),
        );
        const loader = new StubClientCertLoader(source);
        const store = new ClientCertStore(loader);

        store.load();
        const loaded = store.get();

        assert.ok(loaded);
        assert.equal(store.isEmpty(), false);
        assert.equal(loaded?.certBuffer().toString('utf-8'), TEST_CERT_PEM);
        assert.equal(loaded?.keyBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should stay empty when loader returns undefined', () => {
        const store = new ClientCertStore(new StubClientCertLoader(undefined));

        store.load();

        assert.equal(store.isEmpty(), true);
        assert.equal(store.get(), undefined);
    });

    it('should support clear', () => {
        const store = new ClientCertStore(new StubClientCertLoader(ClientCert.fromBuffers(
            Buffer.from(TEST_CERT_PEM, 'utf-8'),
            Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8'),
        )));
        store.load();

        store.clear();

        assert.equal(store.isEmpty(), true);
        assert.equal(store.get(), undefined);
    });
});

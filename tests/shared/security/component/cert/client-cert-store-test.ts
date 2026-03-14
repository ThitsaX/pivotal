import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ClientCert } from '../../../../../packages/shared/security/component/cert/client-cert';
import { ClientCertStore } from '../../../../../packages/shared/security/component/cert/client-cert-store';
import { TEST_CERT_PEM, TEST_PRIVATE_KEY_PEM } from './test-cert-fixtures';

class StubClientCertStore extends ClientCertStore {

    private readonly clientCert: ClientCert | undefined;
    private loadedClientCert: ClientCert | undefined;

    constructor(clientCert: ClientCert | undefined) {
        super();
        this.clientCert = clientCert;
    }

    load(): ClientCertStore {
        this.loadedClientCert = this.clientCert;

        return this;
    }

    get(): ClientCert | undefined {
        return this.loadedClientCert;
    }
}

describe('ClientCertStore', () => {

    it('should load and return client cert pair with self-reference', () => {
        const source = ClientCert.fromBuffers(
            Buffer.from(TEST_CERT_PEM, 'utf-8'),
            Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8'),
        );
        const store = new StubClientCertStore(source);

        const loadedStore = store.load();
        const loaded = store.get();

        assert.equal(loadedStore, store);
        assert.ok(loaded);
        assert.equal(loaded?.certBuffer().toString('utf-8'), TEST_CERT_PEM);
        assert.equal(loaded?.keyBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should stay empty when source returns undefined', () => {
        const store = new StubClientCertStore(undefined);

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get(), undefined);
    });
});

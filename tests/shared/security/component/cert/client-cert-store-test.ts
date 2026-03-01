import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ClientCert } from '../../../../../packages/shared/security/component/cert/client-cert';
import { ClientCertLoader } from '../../../../../packages/shared/security/component/cert/client-cert-loader';
import { ClientCertStore } from '../../../../../packages/shared/security/component/cert/client-cert-store';

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
        const store = new ClientCertStore();
        const source = ClientCert.fromBuffers(
            Buffer.from('client-cert', 'utf-8'),
            Buffer.from('client-key', 'utf-8'),
        );

        store.load(new StubClientCertLoader(source));
        const loaded = store.get();

        assert.ok(loaded);
        assert.equal(store.isEmpty(), false);
        assert.equal(loaded?.certBuffer().toString('utf-8'), 'client-cert');
        assert.equal(loaded?.keyBuffer().toString('utf-8'), 'client-key');
    });

    it('should stay empty when loader returns undefined', () => {
        const store = new ClientCertStore();

        store.load(new StubClientCertLoader(undefined));

        assert.equal(store.isEmpty(), true);
        assert.equal(store.get(), undefined);
    });

    it('should support clear', () => {
        const store = new ClientCertStore();
        store.load(new StubClientCertLoader(ClientCert.fromBuffers(
            Buffer.from('client-cert', 'utf-8'),
            Buffer.from('client-key', 'utf-8'),
        )));

        store.clear();

        assert.equal(store.isEmpty(), true);
        assert.equal(store.get(), undefined);
    });
});

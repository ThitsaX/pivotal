import { Ca } from '../../../../../packages/shared/security/component/cert/ca';
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CaCert } from '../../../../../packages/shared/security/component/cert/ca-cert';
import { CaStore } from '../../../../../packages/shared/security/component/cert/ca-store';
import { TEST_CERT_PEM } from './test-cert-fixtures';

class StubCaStore extends CaStore {

    private certs: CaCert[];
    private combined: Ca | undefined;

    constructor(certs: CaCert[]) {
        super();
        this.certs = certs;
    }

    load(): CaStore {
        if (this.certs.length === 0) {
            return this;
        }

        const incoming = Buffer.concat(this.certs.map((cert) => cert.toBuffer()));
        this.combined = this.combined == null
            ? Ca.fromBuffer(incoming)
            : Ca.fromBuffer(Buffer.concat([this.combined.toBuffer(), incoming]));

        return this;
    }

    get(): Ca | undefined {
        return this.combined;
    }

    setCerts(certs: CaCert[]): void {
        this.certs = certs;
    }
}

describe('CaStore', () => {

    it('should load certs from store implementation and return self', () => {
        const certA = CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8'));
        const certB = CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8'));
        const store = new StubCaStore([certA, certB]);

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get()?.toBuffer().toString('utf-8'), `${TEST_CERT_PEM}${TEST_CERT_PEM}`);
    });

    it('should return defensive copy from get', () => {
        const store = new StubCaStore([
            CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8')),
        ]);

        store.load();

        const cert = store.get();

        assert.ok(cert);

        const certBuffer = cert.toBuffer();
        certBuffer.write('X', 0, 'utf-8');

        assert.equal(store.get()?.toBuffer().toString('utf-8'), TEST_CERT_PEM);
    });

    it('should append certs across multiple load calls', () => {
        const store = new StubCaStore([
            CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8')),
        ]);

        const firstLoadedStore = store.load();

        store.setCerts([
            CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8')),
        ]);
        const secondLoadedStore = store.load();

        assert.equal(firstLoadedStore, store);
        assert.equal(secondLoadedStore, store);
        assert.equal(store.get()?.toBuffer().toString('utf-8'), `${TEST_CERT_PEM}${TEST_CERT_PEM}`);
    });

    it('should return undefined when no certs are loaded', () => {
        const store = new StubCaStore([]);

        store.load();

        assert.equal(store.get(), undefined);
    });
});

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CaCert } from '../../../../../packages/shared/security/component/cert/ca-cert';
import { CaCertLoader } from '../../../../../packages/shared/security/component/cert/ca-cert-loader';
import { CaStore } from '../../../../../packages/shared/security/component/cert/ca-store';
import { TEST_CERT_PEM } from './test-cert-fixtures';

class StubCaCertLoader extends CaCertLoader {

    private certs: CaCert[];

    constructor(certs: CaCert[]) {
        super();
        this.certs = certs;
    }

    load(): CaCert[] {
        return this.certs;
    }

    setCerts(certs: CaCert[]): void {
        this.certs = certs;
    }
}

describe('CaStore', () => {

    it('should load certs from loader and return loaded count', () => {
        const certA = CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8'));
        const certB = CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8'));
        const loader = new StubCaCertLoader([certA, certB]);
        const store = new CaStore(loader);

        const loadedCount = store.load();

        assert.equal(loadedCount, 2);
        assert.equal(store.isEmpty(), false);
        assert.equal(store.toBuffer()?.toString('utf-8'), `${TEST_CERT_PEM}${TEST_CERT_PEM}`);
    });

    it('should return defensive copy from toBuffer', () => {
        const loader = new StubCaCertLoader([
            CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8')),
        ]);
        const store = new CaStore(loader);

        store.load();

        const certBuffer = store.toBuffer();

        assert.ok(certBuffer);

        certBuffer.write('X', 0, 'utf-8');

        assert.equal(store.toBuffer()?.toString('utf-8'), TEST_CERT_PEM);
    });

    it('should append certs across multiple load calls', () => {
        const loader = new StubCaCertLoader([
            CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8')),
        ]);
        const store = new CaStore(loader);

        const firstLoadedCount = store.load();

        loader.setCerts([
            CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8')),
        ]);
        const secondLoadedCount = store.load();

        assert.equal(firstLoadedCount, 1);
        assert.equal(secondLoadedCount, 1);
        assert.equal(store.toBuffer()?.toString('utf-8'), `${TEST_CERT_PEM}${TEST_CERT_PEM}`);
    });

    it('should support clear and empty state accessors', () => {
        const loader = new StubCaCertLoader([]);
        const store = new CaStore(loader);
        const loadedCount = store.load();

        loader.setCerts([
            CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8')),
        ]);
        store.load();
        store.clear();

        assert.equal(loadedCount, 0);
        assert.equal(store.isEmpty(), true);
        assert.equal(store.toBuffer(), undefined);
    });
});

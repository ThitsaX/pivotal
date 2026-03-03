import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CaCert } from '../../../../../packages/shared/security/component/cert/ca-cert';
import { CaCertLoader } from '../../../../../packages/shared/security/component/cert/ca-cert-loader';
import { CaStore } from '../../../../../packages/shared/security/component/cert/ca-store';
import { TEST_CERT_PEM } from './test-cert-fixtures';

class StubCaCertLoader extends CaCertLoader {

    private readonly certs: CaCert[];

    constructor(certs: CaCert[]) {
        super();
        this.certs = certs;
    }

    load(): CaCert[] {
        return this.certs;
    }
}

describe('CaStore', () => {

    it('should load certs from loader and return loaded count', () => {
        const store = new CaStore();
        const certA = CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8'));
        const certB = CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8'));
        const loader = new StubCaCertLoader([certA, certB]);

        const loadedCount = store.load(loader);

        assert.equal(loadedCount, 2);
        assert.equal(store.isEmpty(), false);
        assert.equal(store.toBuffer()?.toString('utf-8'), `${TEST_CERT_PEM}${TEST_CERT_PEM}`);
    });

    it('should return defensive copy from toBuffer', () => {
        const store = new CaStore();
        const loader = new StubCaCertLoader([
            CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8')),
        ]);
        store.load(loader);

        const certBuffer = store.toBuffer();

        assert.ok(certBuffer);

        certBuffer.write('X', 0, 'utf-8');

        assert.equal(store.toBuffer()?.toString('utf-8'), TEST_CERT_PEM);
    });

    it('should append certs across multiple load calls', () => {
        const store = new CaStore();
        const firstLoader = new StubCaCertLoader([
            CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8')),
        ]);
        const secondLoader = new StubCaCertLoader([
            CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8')),
        ]);

        const firstLoadedCount = store.load(firstLoader);
        const secondLoadedCount = store.load(secondLoader);

        assert.equal(firstLoadedCount, 1);
        assert.equal(secondLoadedCount, 1);
        assert.equal(store.toBuffer()?.toString('utf-8'), `${TEST_CERT_PEM}${TEST_CERT_PEM}`);
    });

    it('should support clear and empty state accessors', () => {
        const store = new CaStore();
        const loadedCount = store.load(new StubCaCertLoader([]));

        store.load(new StubCaCertLoader([
            CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8')),
        ]));
        store.clear();

        assert.equal(loadedCount, 0);
        assert.equal(store.isEmpty(), true);
        assert.equal(store.toBuffer(), undefined);
    });
});

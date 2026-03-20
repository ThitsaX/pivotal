import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PrivateKeyStore } from '../../../../../packages/shared/security/component/key/private-key-store';
import { PrivateKey } from '../../../../../packages/shared/security/component/key/private-key';
import { TEST_PRIVATE_KEY_PEM } from './test-key-fixtures';

class StubPrivateKeyStore extends PrivateKeyStore {

    private readonly keysByFspId: Map<string, PrivateKey>;
    private readonly loadedKeysByFspId = new Map<string, PrivateKey>();

    constructor(keysByFspId: Map<string, PrivateKey>) {
        super();
        this.keysByFspId = keysByFspId;
    }

    load(): PrivateKeyStore {
        for (const [fspId, privateKey] of this.keysByFspId.entries()) {
            this.loadedKeysByFspId.set(fspId, PrivateKey.fromBuffer(privateKey.toBuffer()));
        }

        return this;
    }

    get(fspId: string): PrivateKey | undefined {
        const privateKey = this.loadedKeysByFspId.get(fspId);

        if (privateKey == null) {
            return undefined;
        }

        return PrivateKey.fromBuffer(privateKey.toBuffer());
    }
}

describe('PrivateKeyStore', () => {

    it('should load keys from store implementation and return self', () => {
        const privateKeyA = PrivateKey.fromBuffer(Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8'));
        const privateKeyB = PrivateKey.fromBuffer(Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8'));
        const store = new StubPrivateKeyStore(new Map([
            ['fsp-a', privateKeyA],
            ['fsp-b', privateKeyB],
        ]));

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get('fsp-a') != null, true);
        assert.equal(store.get('fsp-b') != null, true);
    });

    it('should return defensive copy from get', () => {
        const sourceKey = PrivateKey.fromBuffer(Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8'));
        const store = new StubPrivateKeyStore(new Map([['fsp-a', sourceKey]]));

        store.load();

        const key = store.get('fsp-a');

        assert.ok(key);
        assert.notEqual(key, sourceKey);

        const keyBuffer = key.toBuffer();
        keyBuffer.write('X', 0, 'utf-8');

        assert.equal(store.get('fsp-a')?.toBuffer().toString('utf-8'), TEST_PRIVATE_KEY_PEM);
    });

    it('should return undefined for unknown fspId', () => {
        const store = new StubPrivateKeyStore(new Map());

        assert.equal(store.get('missing'), undefined);
    });
});

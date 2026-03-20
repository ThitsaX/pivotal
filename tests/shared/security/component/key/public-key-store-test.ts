import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PublicKeyStore } from '../../../../../packages/shared/security/component/key/public-key-store';
import { PublicKey } from '../../../../../packages/shared/security/component/key/public-key';
import { TEST_PUBLIC_KEY_PEM } from './test-key-fixtures';

class StubPublicKeyStore extends PublicKeyStore {

    private readonly keysByFspId: Map<string, PublicKey>;
    private readonly loadedKeysByFspId = new Map<string, PublicKey>();

    constructor(keysByFspId: Map<string, PublicKey>) {
        super();
        this.keysByFspId = keysByFspId;
    }

    load(): PublicKeyStore {
        for (const [fspId, publicKey] of this.keysByFspId.entries()) {
            this.loadedKeysByFspId.set(fspId, PublicKey.fromBuffer(publicKey.toBuffer()));
        }

        return this;
    }

    get(fspId: string): PublicKey | undefined {
        const publicKey = this.loadedKeysByFspId.get(fspId);

        if (publicKey == null) {
            return undefined;
        }

        return PublicKey.fromBuffer(publicKey.toBuffer());
    }
}

describe('PublicKeyStore', () => {

    it('should load keys from store implementation and return self', () => {
        const publicKeyA = PublicKey.fromBuffer(Buffer.from(TEST_PUBLIC_KEY_PEM, 'utf-8'));
        const publicKeyB = PublicKey.fromBuffer(Buffer.from(TEST_PUBLIC_KEY_PEM, 'utf-8'));
        const store = new StubPublicKeyStore(new Map([
            ['fsp-a', publicKeyA],
            ['fsp-b', publicKeyB],
        ]));

        const loadedStore = store.load();

        assert.equal(loadedStore, store);
        assert.equal(store.get('fsp-a') != null, true);
        assert.equal(store.get('fsp-b') != null, true);
    });

    it('should return defensive copy from get', () => {
        const sourceKey = PublicKey.fromBuffer(Buffer.from(TEST_PUBLIC_KEY_PEM, 'utf-8'));
        const store = new StubPublicKeyStore(new Map([['fsp-a', sourceKey]]));

        store.load();

        const key = store.get('fsp-a');

        assert.ok(key);
        assert.notEqual(key, sourceKey);

        const keyBuffer = key.toBuffer();
        keyBuffer.write('X', 0, 'utf-8');

        assert.equal(store.get('fsp-a')?.toBuffer().toString('utf-8'), TEST_PUBLIC_KEY_PEM);
    });

    it('should return undefined for unknown fspId', () => {
        const store = new StubPublicKeyStore(new Map());

        assert.equal(store.get('missing'), undefined);
    });
});

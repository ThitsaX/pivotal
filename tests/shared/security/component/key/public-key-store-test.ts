import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PublicKeyLoader } from '../../../../../packages/shared/security/component/key/public-key-loader';
import { PublicKeyStore } from '../../../../../packages/shared/security/component/key/public-key-store';
import { PublicKey } from '../../../../../packages/shared/security/component/key/public-key';

class StubPublicKeyLoader extends PublicKeyLoader {

    private readonly keysByFspId: Map<string, PublicKey>;

    constructor(keysByFspId: Map<string, PublicKey>) {
        super();
        this.keysByFspId = keysByFspId;
    }

    load(): Map<string, PublicKey> {
        return this.keysByFspId;
    }
}

describe('PublicKeyStore', () => {

    it('should load keys from loader and return loaded count', () => {
        const store = new PublicKeyStore();
        const publicKeyA = PublicKey.fromBuffer(Buffer.from('public-key-a', 'utf-8'));
        const publicKeyB = PublicKey.fromBuffer(Buffer.from('public-key-b', 'utf-8'));
        const loader = new StubPublicKeyLoader(new Map([
            ['fsp-a', publicKeyA],
            ['fsp-b', publicKeyB],
        ]));

        const loadedCount = store.load(loader);

        assert.equal(loadedCount, 2);
        assert.equal(store.has('fsp-a'), true);
        assert.equal(store.has('fsp-b'), true);
    });

    it('should return defensive copy from get and getBuffer', () => {
        const store = new PublicKeyStore();
        const sourceKey = PublicKey.fromBuffer(Buffer.from('public-key-a', 'utf-8'));
        const loader = new StubPublicKeyLoader(new Map([['fsp-a', sourceKey]]));
        store.load(loader);

        const key = store.get('fsp-a');
        const keyBuffer = store.getBuffer('fsp-a');

        assert.ok(key);
        assert.ok(keyBuffer);
        assert.notEqual(key, sourceKey);

        keyBuffer.write('X', 0, 'utf-8');

        assert.equal(store.getBuffer('fsp-a')?.toString('utf-8'), 'public-key-a');
    });

    it('should support delete and clear', () => {
        const store = new PublicKeyStore();
        const loader = new StubPublicKeyLoader(new Map([
            ['fsp-a', PublicKey.fromBuffer(Buffer.from('public-key-a', 'utf-8'))],
            ['fsp-b', PublicKey.fromBuffer(Buffer.from('public-key-b', 'utf-8'))],
        ]));
        store.load(loader);

        const isDeleted = store.delete('fsp-a');
        const isDeletedAgain = store.delete('fsp-a');

        store.clear();

        assert.equal(isDeleted, true);
        assert.equal(isDeletedAgain, false);
        assert.equal(store.has('fsp-b'), false);
    });

    it('should return undefined for unknown fspId', () => {
        const store = new PublicKeyStore();

        assert.equal(store.get('missing'), undefined);
        assert.equal(store.getBuffer('missing'), undefined);
    });
});

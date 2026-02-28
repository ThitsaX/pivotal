import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PrivateKeyLoader } from '../../../../../packages/shared/security/component/key/private-key-loader';
import { PrivateKeyStore } from '../../../../../packages/shared/security/component/key/private-key-store';
import { PrivateKey } from '../../../../../packages/shared/security/component/key/private-key';

class StubPrivateKeyLoader extends PrivateKeyLoader {

    private readonly keysByFspId: Map<string, PrivateKey>;

    constructor(keysByFspId: Map<string, PrivateKey>) {
        super();
        this.keysByFspId = keysByFspId;
    }

    load(): Map<string, PrivateKey> {
        return this.keysByFspId;
    }
}

describe('PrivateKeyStore', () => {

    it('should load keys from loader and return loaded count', () => {
        const store = new PrivateKeyStore();
        const privateKeyA = PrivateKey.fromBuffer(Buffer.from('private-key-a', 'utf-8'));
        const privateKeyB = PrivateKey.fromBuffer(Buffer.from('private-key-b', 'utf-8'));
        const loader = new StubPrivateKeyLoader(new Map([
            ['fsp-a', privateKeyA],
            ['fsp-b', privateKeyB],
        ]));

        const loadedCount = store.load(loader);

        assert.equal(loadedCount, 2);
        assert.equal(store.has('fsp-a'), true);
        assert.equal(store.has('fsp-b'), true);
    });

    it('should return defensive copy from get and getBuffer', () => {
        const store = new PrivateKeyStore();
        const sourceKey = PrivateKey.fromBuffer(Buffer.from('private-key-a', 'utf-8'));
        const loader = new StubPrivateKeyLoader(new Map([['fsp-a', sourceKey]]));
        store.load(loader);

        const key = store.get('fsp-a');
        const keyBuffer = store.getBuffer('fsp-a');

        assert.ok(key);
        assert.ok(keyBuffer);
        assert.notEqual(key, sourceKey);

        keyBuffer.write('X', 0, 'utf-8');

        assert.equal(store.getBuffer('fsp-a')?.toString('utf-8'), 'private-key-a');
    });

    it('should support delete and clear', () => {
        const store = new PrivateKeyStore();
        const loader = new StubPrivateKeyLoader(new Map([
            ['fsp-a', PrivateKey.fromBuffer(Buffer.from('private-key-a', 'utf-8'))],
            ['fsp-b', PrivateKey.fromBuffer(Buffer.from('private-key-b', 'utf-8'))],
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
        const store = new PrivateKeyStore();

        assert.equal(store.get('missing'), undefined);
        assert.equal(store.getBuffer('missing'), undefined);
    });
});

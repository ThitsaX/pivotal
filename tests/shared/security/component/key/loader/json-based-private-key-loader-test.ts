import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JsonBasedPrivateKeyLoader } from '../../../../../../packages/shared/security/component/key/loader/json-based-private-key-loader';

describe('JsonBasedPrivateKeyLoader', () => {

    it('should load keys from object source', () => {
        const loader = JsonBasedPrivateKeyLoader.fromObject({
            'fsp-a': 'line1\\nline2',
            'fsp-b': 'line3\\nline4',
        });

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 2);
        assert.equal(keysByFspId.get('fsp-a')?.toBuffer().toString('utf-8'), 'line1\nline2');
        assert.equal(keysByFspId.get('fsp-b')?.toBuffer().toString('utf-8'), 'line3\nline4');
    });

    it('should load keys from json source', () => {
        const loader = JsonBasedPrivateKeyLoader.fromJson('{"fsp-a":"line1\\\\nline2"}');

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 1);
        assert.equal(keysByFspId.get('fsp-a')?.toBuffer().toString('utf-8'), 'line1\nline2');
    });

    it('should skip blank fsp ids', () => {
        const loader = JsonBasedPrivateKeyLoader.fromObject({
            '   ': 'line1\\nline2',
            'fsp-a': 'line3\\nline4',
        });

        const keysByFspId = loader.load();

        assert.equal(keysByFspId.size, 1);
        assert.equal(keysByFspId.has('fsp-a'), true);
    });

    it('should throw for non-object json source', () => {
        const loader = JsonBasedPrivateKeyLoader.fromJson('[]');

        assert.throws(() => loader.load(), /JSON private key source must be an object\./);
    });

    it('should throw for blank key values', () => {
        const loader = JsonBasedPrivateKeyLoader.fromObject({
            'fsp-a': '   ',
        });

        assert.throws(() => loader.load(), /Private key for 'fsp-a' must be a non-empty string\./);
    });
});

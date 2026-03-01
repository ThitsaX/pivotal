import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CaCert } from '../../../../../packages/shared/security/component/cert/ca-cert';

describe('CaCert', () => {

    it('should create a defensive copy from input buffer', () => {
        const source = Buffer.from('ca-cert', 'utf-8');

        const cert = CaCert.fromBuffer(source);
        source.write('X', 0, 'utf-8');

        assert.equal(cert.toBuffer().toString('utf-8'), 'ca-cert');
    });

    it('should return a defensive copy from toBuffer', () => {
        const cert = CaCert.fromBuffer(Buffer.from('ca-cert', 'utf-8'));

        const returned = cert.toBuffer();
        returned.write('X', 0, 'utf-8');

        assert.equal(cert.toBuffer().toString('utf-8'), 'ca-cert');
    });
});

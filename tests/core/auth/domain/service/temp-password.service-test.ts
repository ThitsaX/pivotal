import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TempPasswordService} from '../../../../../packages/core/auth/domain/service';

describe('TempPasswordService', () => {

    const service = new TempPasswordService();

    it('generates a 16-character password by default', () => {
        const pw = service.generate();
        assert.equal(pw.length, 16);
    });

    it('generates the requested length when explicitly provided', () => {
        const pw = service.generate(24);
        assert.equal(pw.length, 24);
    });

    it('rejects lengths below the NFR-9 minimum of 12', () => {
        assert.throws(() => service.generate(11));
    });

    it('always includes at least one lowercase, uppercase, digit, and symbol (NFR-9)', () => {
        for (let i = 0; i < 100; i += 1) {
            const pw = service.generate();
            assert.match(pw, /[a-z]/, `pw "${pw}" missing lowercase`);
            assert.match(pw, /[A-Z]/, `pw "${pw}" missing uppercase`);
            assert.match(pw, /\d/, `pw "${pw}" missing digit`);
            assert.match(pw, /[^a-zA-Z0-9]/, `pw "${pw}" missing symbol`);
        }
    });

    it('produces distinct values across calls', () => {
        const samples = new Set<string>();
        for (let i = 0; i < 100; i += 1) {
            samples.add(service.generate());
        }
        assert.equal(samples.size, 100, 'collisions in 100 generated temp passwords suggest weak entropy');
    });
});

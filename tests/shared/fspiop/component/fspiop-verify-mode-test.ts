import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FspiopVerifyMode } from '../../../../packages/shared/fspiop/component/fspiop-verify-mode';

describe('FspiopVerifyMode', () => {

    it('should parse every valid mode', () => {
        assert.equal(FspiopVerifyMode.parse('off'), FspiopVerifyMode.Off);
        assert.equal(FspiopVerifyMode.parse('verify-if-present'), FspiopVerifyMode.VerifyIfPresent);
        assert.equal(FspiopVerifyMode.parse('require'), FspiopVerifyMode.Require);
    });

    it('should tolerate surrounding whitespace and casing', () => {
        assert.equal(FspiopVerifyMode.parse('  REQUIRE '), FspiopVerifyMode.Require);
        assert.equal(FspiopVerifyMode.parse('Verify-If-Present'), FspiopVerifyMode.VerifyIfPresent);
    });

    it('should fall back rather than throw on an unrecognised value', () => {
        assert.equal(FspiopVerifyMode.parse('nonsense'), FspiopVerifyMode.Off);
        assert.equal(
            FspiopVerifyMode.parse('nonsense', FspiopVerifyMode.VerifyIfPresent),
            FspiopVerifyMode.VerifyIfPresent,
        );
    });

    it('should fall back on null and undefined', () => {
        assert.equal(FspiopVerifyMode.parse(null), FspiopVerifyMode.Off);
        assert.equal(FspiopVerifyMode.parse(undefined), FspiopVerifyMode.Off);
    });

    it('should report validity separately from parsing', () => {
        assert.equal(FspiopVerifyMode.isValid('require'), true);
        assert.equal(FspiopVerifyMode.isValid('REQUIRE'), true);
        assert.equal(FspiopVerifyMode.isValid('nonsense'), false);
        assert.equal(FspiopVerifyMode.isValid(null), false);
        assert.equal(FspiopVerifyMode.isValid(''), false);
    });
});

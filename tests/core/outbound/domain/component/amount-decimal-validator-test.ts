import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {Currency, FspiopException, Money} from '@shared/fspiop';
import {AmountDecimalValidator} from '../../../../../packages/core/outbound/domain/component/amount-decimal-validator';

const ROUNDING_VALUE_ERROR_CODE = '5241';

function isRoundingError(error: unknown): boolean {
    return error instanceof FspiopException
        && error.errorDefinition.errorType.code === ROUNDING_VALUE_ERROR_CODE;
}

function money(amount: string): Money {
    const value = new Money();
    value.currency = Currency.Usd;
    value.amount = amount;

    return value;
}

describe('AmountDecimalValidator', () => {

    describe('with no decimals allowed (0)', () => {
        const validator = new AmountDecimalValidator(0);

        it('accepts a whole number', () => {
            assert.doesNotThrow(() => validator.validate('123'));
        });

        it('rejects a decimal amount with error code 5241', () => {
            assert.throws(() => validator.validate('123.4'), isRoundingError);
        });

        it('accepts trailing-zero decimals as whole numbers (128.00 -> 128)', () => {
            assert.doesNotThrow(() => validator.validate('128.00'));
            assert.doesNotThrow(() => validator.validate('100.0'));
        });

        it('rejects a real fraction even with trailing zeros (123.40 -> 123.4)', () => {
            assert.throws(() => validator.validate('123.40'), isRoundingError);
        });
    });

    describe('with two decimals allowed (2)', () => {
        const validator = new AmountDecimalValidator(2);

        it('accepts amounts within the allowed places', () => {
            assert.doesNotThrow(() => validator.validate('1'));
            assert.doesNotThrow(() => validator.validate('1.2'));
            assert.doesNotThrow(() => validator.validate('1.23'));
        });

        it('rejects amounts that exceed the allowed places', () => {
            assert.throws(() => validator.validate('1.234'), isRoundingError);
        });
    });

    describe('input handling', () => {
        const validator = new AmountDecimalValidator(0);

        it('treats null, undefined, empty and whitespace as no-ops', () => {
            assert.doesNotThrow(() => validator.validate(null));
            assert.doesNotThrow(() => validator.validate(undefined));
            assert.doesNotThrow(() => validator.validate(''));
            assert.doesNotThrow(() => validator.validate('   '));
        });

        it('validates the amount of a Money object', () => {
            assert.doesNotThrow(() => validator.validate(money('123')));
            assert.throws(() => validator.validate(money('123.4')), isRoundingError);
        });
    });
});

import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {plainToInstance} from 'class-transformer';
import {validate, ValidationError} from 'class-validator';
import {Transform} from 'class-transformer';
import {FspiopMoney, IsFspiopAmount} from '../../../../packages/shared/fspiop';

class AmountHolder {
    @Transform(({value}) => typeof value === 'string' ? FspiopMoney.normalizeAmount(value) : value)
    @IsFspiopAmount()
    amount!: unknown;
}

async function validateAmount(amount: unknown): Promise<{
    instance: AmountHolder;
    errors:   ValidationError[];
}> {
    const instance = plainToInstance(AmountHolder, {amount});
    const errors = await validate(instance);

    return {instance, errors};
}

function messages(errors: ValidationError[]): string[] {
    return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('IsFspiopAmount', () => {

    it('accepts a valid FSPIOP amount', async () => {
        const {instance, errors} = await validateAmount('500');

        assert.deepEqual(errors, []);
        assert.equal(instance.amount, '500');
    });

    it('normalizes whitespace and trailing zeros', async () => {
        const {instance, errors} = await validateAmount('  44.40  ');

        assert.deepEqual(errors, []);
        assert.equal(instance.amount, '44.4');
    });

    it('reports "amount is required" when the value is undefined', async () => {
        const {errors} = await validateAmount(undefined);

        assert.ok(messages(errors).includes('amount is required'));
    });

    it('reports "amount is required" when the value is null', async () => {
        const {errors} = await validateAmount(null);

        assert.ok(messages(errors).includes('amount is required'));
    });

    it('reports "amount is required" when the value is an empty string', async () => {
        const {errors} = await validateAmount('');

        assert.ok(messages(errors).includes('amount is required'));
    });

    it('reports "amount is required" when the value is whitespace-only', async () => {
        const {errors} = await validateAmount('   ');

        assert.ok(messages(errors).includes('amount is required'));
    });

    it('reports "amount must be a string" when the value is a number', async () => {
        const {errors} = await validateAmount(500);

        assert.ok(messages(errors).includes('amount must be a string'));
    });

    it('reports "amount must be a string" when the value is a boolean', async () => {
        const {errors} = await validateAmount(true);

        assert.ok(messages(errors).includes('amount must be a string'));
    });

    it('reports the pattern error for the literal string "NULL"', async () => {
        const {errors} = await validateAmount('NULL');

        assert.ok(messages(errors).includes('amount must be a valid FSPIOP Amount'));
    });

    it('reports the pattern error for non-numeric input', async () => {
        const {errors} = await validateAmount('abc');

        assert.ok(messages(errors).includes('amount must be a valid FSPIOP Amount'));
    });

    it('reports the pattern error for negative amounts', async () => {
        const {errors} = await validateAmount('-5');

        assert.ok(messages(errors).includes('amount must be a valid FSPIOP Amount'));
    });

    it('reports the pattern error for amounts with leading zeros', async () => {
        const {errors} = await validateAmount('00.5');

        assert.ok(messages(errors).includes('amount must be a valid FSPIOP Amount'));
    });

    it('reports the pattern error for amounts with more than four fractional digits', async () => {
        const {errors} = await validateAmount('1.23456');

        assert.ok(messages(errors).includes('amount must be a valid FSPIOP Amount'));
    });
});

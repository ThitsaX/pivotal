import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {plainToInstance} from 'class-transformer';
import {validate, ValidationError} from 'class-validator';
import {PutSendMoneyRequest} from '../../../../packages/apps/web-outbound/controllers/send-money.controller';

async function validateRequest(body: Record<string, unknown>): Promise<{
    request: PutSendMoneyRequest;
    errors:  ValidationError[];
}> {
    const request = plainToInstance(PutSendMoneyRequest, body);
    const errors = await validate(request);

    return {request, errors};
}

function messages(errors: ValidationError[]): string[] {
    return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('PutSendMoneyRequest', () => {

    it('requires amount when acceptParty is true', async () => {
        const {errors} = await validateRequest({acceptParty: true});

        assert.ok(messages(errors).includes('amount is required'));
    });

    it('rejects blank amount when acceptParty is true', async () => {
        const {request, errors} = await validateRequest({acceptParty: true, amount: '   '});

        assert.equal(request.amount, '');
        assert.ok(messages(errors).includes('amount is required'));
    });

    it('rejects malformed amount when acceptParty is true', async () => {
        const {errors} = await validateRequest({acceptParty: true, amount: 'abc'});

        assert.ok(messages(errors).includes('amount must be a valid FSPIOP Amount'));
    });

    it('normalizes a valid acceptParty amount', async () => {
        const {request, errors} = await validateRequest({acceptParty: true, amount: '  12.34  '});

        assert.deepEqual(errors, []);
        assert.equal(request.amount, '12.34');
    });

    it('strips trailing fractional zeros so 44.40 is accepted as 44.4', async () => {
        const {request, errors} = await validateRequest({acceptParty: true, amount: '44.40'});

        assert.deepEqual(errors, []);
        assert.equal(request.amount, '44.4');
    });

    it('does not require amount when acceptParty is false (rejection)', async () => {
        const {errors} = await validateRequest({acceptParty: false});

        assert.deepEqual(errors, []);
    });

    it('does not require amount when only acceptQuote is provided', async () => {
        const {errors} = await validateRequest({acceptQuote: true});

        assert.deepEqual(errors, []);
    });
});

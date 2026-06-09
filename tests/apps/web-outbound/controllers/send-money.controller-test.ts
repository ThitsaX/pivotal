import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {plainToInstance} from 'class-transformer';
import {validate, ValidationError} from 'class-validator';
import {
    PutSendMoneyRequest,
    SendMoneyController,
} from '../../../../packages/apps/web-outbound/controllers/send-money.controller';
import {FspiopErrors, FspiopException} from '../../../../packages/shared/fspiop';

async function validateRequest(body: Record<string, unknown>): Promise<{
    request: PutSendMoneyRequest;
    errors:  ValidationError[];
}> {
    const request = plainToInstance(PutSendMoneyRequest, body);
    const errors = await validate(request, {whitelist: true});

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

    it('keeps extensionList when acceptParty is true', async () => {
        const extensionList = {
            extension: [
                {key: 'payerFee', value: '1.23'},
                {key: 'payerFeeCurrency', value: 'USD'},
            ],
        };
        const {request, errors} = await validateRequest({acceptParty: true, amount: '12.34', extensionList});

        assert.deepEqual(errors, []);
        assert.deepEqual(request.extensionList, extensionList);
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

describe('SendMoneyController', () => {

    it('rejects POST sendmoney when fspiop-source differs from request payer FSP', async () => {
        const controller = new SendMoneyController({
            async execute(): Promise<never> {
                throw new Error('command bus should not be called');
            },
        } as never);

        const request = {
            homeTransactionId: 'home-1',
            from: {
                idType: 'MSISDN',
                idValue: '2769100001',
                fspId: 'wallet1',
            },
            to: {
                idType: 'MSISDN',
                idValue: '2769200001',
                fspId: 'wallet2',
            },
            amountType: 'SEND',
            amount: '10',
            currency: 'USD',
            transactionType: 'TRANSFER',
            subScenario: 'PERSON_TO_PERSON',
        };

        await assert.rejects(
            () => controller.post('wallet2', request as never),
            (error: unknown) => error instanceof FspiopException
                && error.errorDefinition.errorType.code === FspiopErrors.PAYER_PERMISSION_ERROR.errorType.code,
        );
    });
});

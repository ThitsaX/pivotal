import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {plainToInstance} from 'class-transformer';
import {validate, ValidationError} from 'class-validator';
import {
    PutSendMoneyRequest,
    SendMoneyController,
} from '../../../../packages/apps/web-outbound/controllers/send-money.controller';
import {SendMoneyRequest} from '../../../../packages/core/outbound/domain';
import {FspiopErrors, FspiopException} from '../../../../packages/shared/fspiop';
import { Test, TestingModule } from '@nestjs/testing';
import { AmountTypeConstraint } from '../../../../packages/shared/fspiop';
import { useContainer } from 'class-validator';

async function validateRequest(body: Record<string, unknown>): Promise<{
    request: PutSendMoneyRequest;
    errors:  ValidationError[];
}> {
    const request = plainToInstance(PutSendMoneyRequest, body);
    const errors = await validate(request, {whitelist: true});

    return {request, errors};
}

async function validateSendMoneyRequest(body: Record<string, unknown>, strictAmountType: boolean = false): Promise<{
    request: SendMoneyRequest;
    errors:  ValidationError[];
}> {
    const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
            {
                provide: AmountTypeConstraint,
                useValue: new AmountTypeConstraint(strictAmountType),
            },
        ],
    }).compile();
    useContainer(moduleRef, { fallbackOnErrors: true });

    const request = plainToInstance(SendMoneyRequest, body);
    const errors = await validate(request, {whitelist: true});

    return {request, errors};
}

function messages(errors: ValidationError[]): string[] {
    return errors.flatMap((error) => [
        ...Object.values(error.constraints ?? {}),
        ...messages(error.children ?? []),
    ]);
}

function sendMoneyBody(fromFspId: string, toFspId: string): Record<string, unknown> {
    return {
        homeTransactionId: 'home-1',
        from: {
            idType: 'MSISDN',
            idValue: '2769100001',
            fspId: fromFspId,
        },
        to: {
            idType: 'MSISDN',
            idValue: '2769200001',
            fspId: toFspId,
        },
        amountType: 'SEND',
        amount: 12,
        currency: 'USD',
        transactionType: 'TRANSFER',
        subScenario: 'PERSON_TO_PERSON',
    };
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

    it('normalizes a valid numeric acceptParty amount', async () => {
        const {request, errors} = await validateRequest({acceptParty: true, amount: 12});

        assert.deepEqual(errors, []);
        assert.equal(request.amount, '12');
    });

    it('keeps extensionList when acceptParty is true', async () => {
        const extensionList = {
            extension: [
                {key: 'schemeFee', value: '10'},
                {key: 'payerProvidedFee', value: '5'},
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

    it('accepts and trims homeTransactionId with acceptQuote', async () => {
        const {request, errors} = await validateRequest({
            acceptQuote: true,
            homeTransactionId: '  payer-home-final  ',
        });

        assert.deepEqual(errors, []);
        assert.equal(request.homeTransactionId, 'payer-home-final');
    });

    it('rejects a blank homeTransactionId with acceptQuote', async () => {
        const {errors} = await validateRequest({acceptQuote: true, homeTransactionId: '   '});

        assert.ok(messages(errors).includes('homeTransactionId should not be empty'));
    });

    it('rejects an over-length homeTransactionId with acceptQuote', async () => {
        const {errors} = await validateRequest({acceptQuote: true, homeTransactionId: 'h'.repeat(129)});

        assert.ok(messages(errors).includes('homeTransactionId must not exceed 128 characters'));
    });
});

describe('SendMoneyRequest', () => {

    it('normalizes a valid numeric amount', async () => {
        const {request, errors} = await validateSendMoneyRequest(sendMoneyBody('wallet1', 'wallet2'));

        assert.deepEqual(errors, []);
        assert.equal(request.amount, '12');
    });

    it('accepts 32-character payer and payee FSP IDs', async () => {
        const fspId = 'f'.repeat(32);
        const {errors} = await validateSendMoneyRequest(sendMoneyBody(fspId, fspId));

        assert.deepEqual(errors, []);
    });

    it('accepts a missing payee FSP ID for oracle-based resolution', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        delete (body.to as Record<string, unknown>).fspId;
        Object.assign(body.to as Record<string, unknown>, {
            idType:  'ALIAS',
            idValue: 'merchant-123',
        });

        const {request, errors} = await validateSendMoneyRequest(body);

        assert.deepEqual(errors, []);
        assert.equal(request.to.fspId, undefined);
    });

    it('normalizes an empty payee FSP ID to undefined', async () => {
        const body = sendMoneyBody('wallet1', '');
        Object.assign(body.to as Record<string, unknown>, {
            idType:  'BUSINESS',
            idValue: 'merchant-123',
        });

        const {request, errors} = await validateSendMoneyRequest(body);

        assert.deepEqual(errors, []);
        assert.equal(request.to.fspId, undefined);
    });

    it('still requires the payer FSP ID', async () => {
        const body = sendMoneyBody('', 'wallet2');

        const {errors} = await validateSendMoneyRequest(body);

        assert.ok(messages(errors).includes('from.fspId is required'));
    });

    it('accepts underscores and hyphens in FSP IDs', async () => {
        const {errors} = await validateSendMoneyRequest(sendMoneyBody('payer_fsp-1', 'payee_fsp-2'));

        assert.deepEqual(errors, []);
    });

    it('rejects unsupported characters in FSP IDs', async () => {
        const {errors} = await validateSendMoneyRequest(sendMoneyBody('payer.fsp', 'payee fsp'));

        assert.equal(
            messages(errors).filter((message) => message === 'fspId must contain only letters, numbers, underscores, or hyphens').length,
            2,
        );
    });

    it('rejects a 33-character payer FSP ID', async () => {
        const {errors} = await validateSendMoneyRequest(sendMoneyBody('f'.repeat(33), 'wallet2'));

        assert.ok(messages(errors).includes('fspId must not exceed 32 characters'));
    });

    it('rejects a 33-character payee FSP ID', async () => {
        const {errors} = await validateSendMoneyRequest(sendMoneyBody('wallet1', 'f'.repeat(33)));

        assert.ok(messages(errors).includes('fspId must not exceed 32 characters'));
    });

    it('accepts a 128-character payer idValue', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        Object.assign(body.from as Record<string, unknown>, {
            idType:  'ACCOUNT_ID',
            idValue: 'x'.repeat(128),
        });

        const {errors} = await validateSendMoneyRequest(body);

        assert.deepEqual(errors, []);
    });

    it('accepts international and leading-zero local MSISDN values', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        (body.from as Record<string, unknown>).idValue = '+224621234567';
        (body.to as Record<string, unknown>).idValue = '09980702315';

        const {errors} = await validateSendMoneyRequest(body);

        assert.deepEqual(errors, []);
    });

    it('rejects malformed and formatted MSISDN values', async () => {
        const invalidValues = [
            '+224 621 234 567',
            '224-621-234-567',
            '+09980702315',
            '1234567890123456',
        ];

        for (const idValue of invalidValues) {
            const body = sendMoneyBody('wallet1', 'wallet2');
            (body.to as Record<string, unknown>).idValue = idValue;

            const {errors} = await validateSendMoneyRequest(body);

            assert.ok(
                messages(errors).includes('idValue for MSISDN must contain 2 to 15 digits, with an optional leading plus sign for international numbers'),
                `expected MSISDN validation error for ${idValue}`,
            );
        }
    });

    it('accepts visible Mojaloop party identifier formats', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        Object.assign(body.from as Record<string, unknown>, {
            idType:  'MSISDN',
            idValue: '+224621234567',
        });
        Object.assign(body.to as Record<string, unknown>, {
            idType:  'EMAIL',
            idValue: 'person+tag@example.com',
        });

        const {errors} = await validateSendMoneyRequest(body);

        assert.deepEqual(errors, []);
    });

    it('accepts letters, numbers, underscores, and hyphens in BUSINESS and ALIAS idValue', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        Object.assign(body.from as Record<string, unknown>, {
            idType:  'BUSINESS',
            idValue: 'BUSINESS_123-ABC',
        });
        Object.assign(body.to as Record<string, unknown>, {
            idType:  'ALIAS',
            idValue: 'LBR-MER_00012345',
        });

        const {errors} = await validateSendMoneyRequest(body);

        assert.deepEqual(errors, []);
    });

    it('rejects unsupported characters in BUSINESS and ALIAS idValue', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        Object.assign(body.from as Record<string, unknown>, {
            idType:  'BUSINESS',
            idValue: 'business.example',
        });
        Object.assign(body.to as Record<string, unknown>, {
            idType:  'ALIAS',
            idValue: 'merchant alias',
        });

        const {errors} = await validateSendMoneyRequest(body);

        assert.equal(
            messages(errors).filter((message) => message === 'idValue for BUSINESS or ALIAS must contain only letters, numbers, underscores, or hyphens').length,
            2,
        );
    });

    it('rejects control characters in payer and payee idValue', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        (body.from as Record<string, unknown>).idValue = '\u0003 /bin/sleep 4 \r';
        (body.to as Record<string, unknown>).idValue = '2769\u200B200001';

        const {errors} = await validateSendMoneyRequest(body);

        assert.equal(
            messages(errors).filter((message) => message === 'idValue must not contain control or formatting characters').length,
            2,
        );
    });

    it('rejects a 129-character payer idValue (the payer_id overflow that jammed the audit consumer)', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        Object.assign(body.from as Record<string, unknown>, {
            idType:  'ACCOUNT_ID',
            idValue: 'x'.repeat(129),
        });

        const {errors} = await validateSendMoneyRequest(body);

        assert.ok(messages(errors).includes('idValue must not exceed 128 characters'));
    });

    it('rejects a 129-character payee idValue', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        Object.assign(body.to as Record<string, unknown>, {
            idType:  'ACCOUNT_ID',
            idValue: 'x'.repeat(129),
        });

        const {errors} = await validateSendMoneyRequest(body);

        assert.ok(messages(errors).includes('idValue must not exceed 128 characters'));
    });

    it('rejects an over-length idSubValue', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        (body.from as Record<string, unknown>).idSubValue = 'x'.repeat(129);

        const {errors} = await validateSendMoneyRequest(body);

        assert.ok(messages(errors).includes('idSubValue must not exceed 128 characters'));
    });

    it('accepts a 32-character subScenario', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        body.subScenario = 'S'.repeat(32);

        const {errors} = await validateSendMoneyRequest(body);

        assert.deepEqual(errors, []);
    });

    it('rejects a 33-character subScenario (FSPIOP TransactionSubScenario max 32)', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        body.subScenario = 'S'.repeat(33);

        const {errors} = await validateSendMoneyRequest(body);

        assert.ok(messages(errors).includes('subScenario must not exceed 32 characters'));
    });

    it('rejects an over-length note', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        body.note = 'x'.repeat(129);

        const {errors} = await validateSendMoneyRequest(body);

        assert.ok(messages(errors).includes('note must not exceed 128 characters'));
    });

    it('rejects an over-length homeTransactionId', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        body.homeTransactionId = 'x'.repeat(129);

        const {errors} = await validateSendMoneyRequest(body);

        assert.ok(messages(errors).includes('homeTransactionId must not exceed 128 characters'));
    });

    it('rejects an over-length party name field (lastName)', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        (body.from as Record<string, unknown>).lastName = 'x'.repeat(129);

        const {errors} = await validateSendMoneyRequest(body);

        assert.ok(messages(errors).includes('lastName must not exceed 128 characters'));
    });

    it('rejects an over-length merchantClassificationCode', async () => {
        const body = sendMoneyBody('wallet1', 'wallet2');
        (body.to as Record<string, unknown>).merchantClassificationCode = '12345';

        const {errors} = await validateSendMoneyRequest(body);

        assert.ok(messages(errors).includes('merchantClassificationCode must not exceed 4 characters'));
    });

    it('rejects SEND amountType if subScenario is PERSON_TO_PERSON', async () => {
        process.env["STRICT_AMOUNT_TYPE"] = 'true';
        const body = sendMoneyBody('wallet1', 'wallet2');
        body.subScenario = 'PERSON_TO_PERSON';
        body.amountType = 'SEND'

        const {errors} = await validateSendMoneyRequest(body, true);

        assert.ok(messages(errors).includes('Invalid amountType value'));
    })

    it('rejects RECEIVE amountType if subScenario is PERSON_TO_BUSINESS', async () => {
        process.env["STRICT_AMOUNT_TYPE"] = 'true';
        const body = sendMoneyBody('wallet1', 'wallet2');
        body.subScenario = 'PERSON_TO_BUSINESS';
        body.amountType = 'RECEIVE'

        const {errors} = await validateSendMoneyRequest(body, true);

        assert.ok(messages(errors).includes('Invalid amountType value'));
    })

    it('does not validate amountType if STRICT_AMOUNT_TYPE is set to false', async () => {
        const STRICT_AMOUNT_TYPE = false;
        const body = sendMoneyBody('wallet1', 'wallet2');
        body.subScenario = 'PERSON_TO_BUSINESS';
        body.amountType = 'RECEIVE'

        const {errors} = await validateSendMoneyRequest(body, STRICT_AMOUNT_TYPE);

        assert.deepEqual(errors, []);
    })
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

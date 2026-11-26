// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {plainToInstance} from 'class-transformer';
import {useContainer, validate, ValidationError} from 'class-validator';
import {Test, TestingModule} from '@nestjs/testing';
import {AmountTypeConstraint} from '../../../../../packages/shared/fspiop';
import {HasPayeeFspIdConstraint} from '../../../../../packages/core/outbound/domain/component/has-payee-fsp-id.constraint';
import {ToIdTypeSubScenarioConstraint} from '../../../../../packages/core/outbound/domain/component/to-id-type-subscenario.constraint';
import {SendMoneyRequest} from '../../../../../packages/core/outbound/domain/dto/send-money-request';

function messages(errors: ValidationError[]): string[] {
    return errors.flatMap((error) => [
        ...Object.values(error.constraints ?? {}),
        ...messages(error.children ?? []),
    ]);
}

async function validateBody(
    body: Record<string, unknown>,
    enabled: boolean,
): Promise<ValidationError[]> {
    const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
            {provide: AmountTypeConstraint, useValue: new AmountTypeConstraint(false)},
            {provide: HasPayeeFspIdConstraint, useValue: new HasPayeeFspIdConstraint(true)},
            {provide: ToIdTypeSubScenarioConstraint, useValue: new ToIdTypeSubScenarioConstraint(enabled)},
        ],
    }).compile();
    useContainer(moduleRef, {fallbackOnErrors: true});

    const request = plainToInstance(SendMoneyRequest, body);
    return validate(request, {whitelist: true});
}

function baseBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        homeTransactionId: 'home-1',
        from: {idType: 'MSISDN', idValue: '2769100001', fspId: 'wallet1'},
        to: {idType: 'MSISDN', idValue: '2769200001', fspId: 'wallet2'},
        amountType: 'SEND',
        amount: '12',
        currency: 'USD',
        transactionType: 'TRANSFER',
        subScenario: 'PERSON_TO_PERSON',
        ...overrides,
    };
}

describe('ToIdTypeSubScenarioConstraint', () => {
    it('rejects BUSINESS for PERSON_TO_PERSON when enabled', async () => {
        const errors = await validateBody(baseBody({
            to: {idType: 'BUSINESS', idValue: 'MERCHANT001', fspId: 'wallet2'},
        }), true);

        assert.ok(messages(errors).includes('to.idType does not match the specified subScenario'));
    });

    it('accepts MSISDN and ACCOUNT_ID for PERSON_TO_PERSON when enabled', async () => {
        for (const [idType, idValue] of [
            ['MSISDN', '2769200001'],
            ['ACCOUNT_ID', 'account-1'],
        ] as const) {
            const errors = await validateBody(baseBody({
                to: {idType, idValue, fspId: 'wallet2'},
            }), true);

            assert.deepEqual(errors, [], `expected ${idType} to be accepted for PERSON_TO_PERSON`);
        }
    });

    it('rejects MSISDN for PERSON_TO_BUSINESS when enabled', async () => {
        const errors = await validateBody(baseBody({
            subScenario: 'PERSON_TO_BUSINESS',
            to: {idType: 'MSISDN', idValue: '2769200001', fspId: 'wallet2'},
        }), true);

        assert.ok(messages(errors).includes('to.idType does not match the specified subScenario'));
    });

    it('accepts BUSINESS for PERSON_TO_BUSINESS when enabled', async () => {
        const errors = await validateBody(baseBody({
            subScenario: 'PERSON_TO_BUSINESS',
            to: {idType: 'BUSINESS', idValue: 'MERCHANT001', fspId: 'wallet2'},
        }), true);

        assert.deepEqual(errors, []);
    });

    it('skips unrestricted subScenarios when enabled', async () => {
        const errors = await validateBody(baseBody({
            subScenario: 'GOVERNMENT_TO_PERSON',
            to: {idType: 'BUSINESS', idValue: 'MERCHANT001', fspId: 'wallet2'},
        }), true);

        assert.deepEqual(errors, []);
    });

    it('does not apply rules to from.idType', async () => {
        const errors = await validateBody(baseBody({
            from: {idType: 'BUSINESS', idValue: 'PAYER_BIZ', fspId: 'wallet1'},
            to: {idType: 'MSISDN', idValue: '2769200001', fspId: 'wallet2'},
        }), true);

        assert.deepEqual(errors, []);
    });

    it('does nothing when disabled', async () => {
        const errors = await validateBody(baseBody({
            to: {idType: 'BUSINESS', idValue: 'MERCHANT001', fspId: 'wallet2'},
        }), false);

        assert.deepEqual(errors, []);
    });
});

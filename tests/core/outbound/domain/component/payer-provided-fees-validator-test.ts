// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {AmountDecimalValidator, PayerProvidedFeesValidator} from '../../../../../packages/core/outbound/domain/component';
import {ExtensionList, FspiopErrors, FspiopException} from '../../../../../packages/shared/fspiop';

function extensionList(...keys: string[]): ExtensionList {
    return {
        extension: keys.map((key) => ({key, value: '10'})),
    };
}

function assertFeeValidationError(action: () => void): void {
    assert.throws(
        action,
        (error: unknown) => error instanceof FspiopException
            && error.errorDefinition.errorType.code
                === FspiopErrors.MISSING_EXTENSION_PARAMETER.errorType.code
            && error.message === PayerProvidedFeesValidator.ERROR_DESCRIPTION,
    );
}

function validator(mandatory: boolean, decimalPlaces: number = 2): PayerProvidedFeesValidator {
    return new PayerProvidedFeesValidator(
        mandatory,
        new AmountDecimalValidator(decimalPlaces),
    );
}

function feeValues(payerProvidedSchemeFee: unknown, payerProvidedPayerFee: unknown): ExtensionList {
    return {
        extension: [
            {key: 'payerProvidedSchemeFee', value: payerProvidedSchemeFee},
            {key: 'payerProvidedPayerFee', value: payerProvidedPayerFee},
        ],
    } as ExtensionList;
}

function assertErrorCode(action: () => void, expectedCode: string): void {
    assert.throws(
        action,
        (error: unknown) => error instanceof FspiopException
            && error.errorDefinition.errorType.code === expectedCode,
    );
}

describe('PayerProvidedFeesValidator', () => {
    it('accepts acceptParty when both required fee keys are present', () => {
        const feeValidator = validator(true);

        assert.doesNotThrow(() => feeValidator.validate(
            true,
            extensionList('payerProvidedSchemeFee', 'payerProvidedPayerFee'),
        ));
    });

    it('accepts string and number fee values and normalizes both to strings', () => {
        const feeValidator = validator(true);
        const fees = feeValues('10.50', 5.10);

        feeValidator.validate(true, fees);

        assert.equal(fees.extension[0]!.value, '10.5');
        assert.equal(fees.extension[1]!.value, '5.1');
    });

    it('rejects payerProvidedSchemeFee when it exceeds DECIMAL_PLACES', () => {
        const feeValidator = validator(true, 2);

        assertErrorCode(
            () => feeValidator.validate(true, feeValues('10.123', '5.1')),
            FspiopErrors.ROUNDING_VALUE_ERROR.errorType.code,
        );
    });

    it('rejects payerProvidedPayerFee when it exceeds DECIMAL_PLACES', () => {
        const feeValidator = validator(true, 2);

        assertErrorCode(
            () => feeValidator.validate(true, feeValues('10.12', 5.123)),
            FspiopErrors.ROUNDING_VALUE_ERROR.errorType.code,
        );
    });

    it('rejects decimal fee values when DECIMAL_PLACES is zero', () => {
        const feeValidator = validator(true, 0);

        assertErrorCode(
            () => feeValidator.validate(true, feeValues('10.1', '5')),
            FspiopErrors.ROUNDING_VALUE_ERROR.errorType.code,
        );
    });

    it('rejects malformed fee values', () => {
        const feeValidator = validator(true);

        assertErrorCode(
            () => feeValidator.validate(true, feeValues('not-an-amount', '5')),
            FspiopErrors.MALFORMED_SYNTAX.errorType.code,
        );
    });

    it('rejects acceptParty when payerProvidedSchemeFee is missing', () => {
        const feeValidator = validator(true);

        assertFeeValidationError(() => feeValidator.validate(
            true,
            extensionList('payerProvidedPayerFee'),
        ));
    });

    it('rejects acceptParty when payerProvidedPayerFee is missing', () => {
        const feeValidator = validator(true);

        assertFeeValidationError(() => feeValidator.validate(
            true,
            extensionList('payerProvidedSchemeFee'),
        ));
    });

    it('rejects acceptParty when extensionList is missing', () => {
        const feeValidator = validator(true);

        assertFeeValidationError(() => feeValidator.validate(true, undefined));
    });

    it('does not validate fee presence or decimals when the setting is disabled', () => {
        const feeValidator = validator(false, 0);

        assert.doesNotThrow(() => feeValidator.validate(true, feeValues('10.123', 5.123)));
        assert.doesNotThrow(() => feeValidator.validate(true, undefined));
    });

    it('does not require fee keys when the payer rejects the party', () => {
        const feeValidator = validator(true);

        assert.doesNotThrow(() => feeValidator.validate(false, undefined));
    });

    it('treats the required extension keys as case-sensitive', () => {
        const feeValidator = validator(true);

        assertFeeValidationError(() => feeValidator.validate(
            true,
            extensionList('PayerProvidedSchemeFee', 'payerprovidedpayerfee'),
        ));
    });
});

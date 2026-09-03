// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ExtensionList, FspiopErrors, FspiopException, FspiopMoney} from '@shared/fspiop';
import {AmountDecimalValidator} from './amount-decimal-validator';

export class PayerProvidedFeesValidator {
    static readonly ERROR_DESCRIPTION =
        'Fee validation failed. Required fee information was not provided by the Payer DFSP.';

    private static readonly REQUIRED_EXTENSION_KEYS = [
        'payerProvidedSchemeFee',
        'payerProvidedPayerFee',
    ] as const;

    constructor(
        private readonly mandatory: boolean,
        private readonly amountDecimalValidator: AmountDecimalValidator,
    ) {
    }

    validate(
        acceptParty: boolean,
        extensionList: ExtensionList | undefined,
    ): void {
        if (!acceptParty || !this.mandatory) {
            return;
        }

        const extensions = Array.isArray(extensionList?.extension)
            ? extensionList.extension
            : [];
        const requiredFees = PayerProvidedFeesValidator.REQUIRED_EXTENSION_KEYS
            .map((key) => {
                const extension = extensions.find((item) => item.key === key);

                if (extension == null) {
                    throw new FspiopException(
                        FspiopErrors.MISSING_EXTENSION_PARAMETER,
                        PayerProvidedFeesValidator.ERROR_DESCRIPTION,
                    );
                }

                return extension;
            });

        for (const extension of requiredFees) {
            extension.value = this.normalizeAndValidateFee(
                extension.key,
                extension.value as unknown,
            );
        }
    }

    private normalizeAndValidateFee(fieldName: string, value: unknown): string {
        if (typeof value !== 'string' && typeof value !== 'number') {
            throw new FspiopException(
                FspiopErrors.MALFORMED_SYNTAX,
                `${fieldName} must be a string or number.`,
            );
        }

        const normalized = FspiopMoney.normalizeAmount(value);

        if (!FspiopMoney.AMOUNT_PATTERN.test(normalized)) {
            throw new FspiopException(
                FspiopErrors.MALFORMED_SYNTAX,
                `${fieldName} must be a valid FSPIOP amount.`,
            );
        }

        this.amountDecimalValidator.validate(normalized);

        return normalized;
    }
}

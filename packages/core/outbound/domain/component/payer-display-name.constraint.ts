// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import {FspParty} from '../dto/fsp-party';

/**
 * Validates the payer {@link FspParty.displayName} on POST /secured/sendmoney.
 *
 * Missing, null, and empty-string values stay accepted. When the payer sends any
 * other value, it is trimmed and must contain at least one letter or digit, stay
 * within 128 characters, and avoid control or invisible formatting characters.
 * A successful check replaces the field with the trimmed value for later use.
 *
 * Payee display names are not checked here. That side is controlled by the DFSP.
 */
@ValidatorConstraint({name: 'isPayerDisplayName', async: false})
export class PayerDisplayNameConstraint implements ValidatorConstraintInterface {

    private static readonly MAX_LENGTH = 128;

    private static readonly DISPLAY_NAME_PATTERN =
        /^(?=.*[\p{L}\p{N}])(?:[^\p{Cc}\p{Cf}\p{Cs}]|\p{Join_Control})+$/u;

    validate(value: unknown): boolean {
        if (value == null || typeof value !== 'object') {
            return true;
        }

        const party = value as FspParty;
        const displayName = party.displayName;

        if (displayName == null || displayName === '') {
            return true;
        }

        if (typeof displayName !== 'string') {
            return false;
        }

        const trimmed = displayName.trim();

        if (
            trimmed.length === 0
            || trimmed.length > PayerDisplayNameConstraint.MAX_LENGTH
            || !PayerDisplayNameConstraint.DISPLAY_NAME_PATTERN.test(trimmed)
        ) {
            return false;
        }

        party.displayName = trimmed;
        return true;
    }

    defaultMessage(): string {
        return 'from.displayName must be 1 to 128 characters after trimming, contain at least one letter or digit, and must not contain control or invisible formatting characters';
    }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

import {
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import { FspParty } from '../dto/fsp-party';

@ValidatorConstraint({ name: 'hasPayeeFspId', async: false })
export class HasPayeeFspIdConstraint implements ValidatorConstraintInterface {

    constructor(private readonly required = false) {
    }

    validate(value: unknown): boolean {
        if (!this.required) {
            return true;
        }

        const fspId = (value as FspParty | undefined)?.fspId;
        return typeof fspId === 'string' && fspId.trim().length > 0;
    }
    defaultMessage(): string {
        return 'to.fspId is required';
    }
}
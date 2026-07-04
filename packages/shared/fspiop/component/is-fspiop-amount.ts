// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import {FspiopMoney} from './fspiop-money';

@ValidatorConstraint({name: 'isFspiopAmount', async: false})
export class FspiopAmountConstraint implements ValidatorConstraintInterface {

    validate(value: unknown): boolean {
        if (typeof value !== 'string' && typeof value !== 'number') {
            return false;
        }

        const amount = FspiopMoney.normalizeAmount(value);

        return amount.length > 0 && FspiopMoney.AMOUNT_PATTERN.test(amount);
    }

    defaultMessage(args: ValidationArguments): string {
        const value = args.value;
        const property = args.property;

        if (value == null) {
            return `${property} is required`;
        }

        if (typeof value !== 'string' && typeof value !== 'number') {
            return `${property} must be a string or number`;
        }

        if (FspiopMoney.normalizeAmount(value).length === 0) {
            return `${property} is required`;
        }

        return `${property} must be a valid FSPIOP Amount`;
    }
}

export function IsFspiopAmount(options?: ValidationOptions): PropertyDecorator {
    return (target: object, propertyKey: string | symbol): void => {
        registerDecorator({
            name: 'isFspiopAmount',
            target: target.constructor,
            propertyName: propertyKey as string,
            options,
            constraints: [],
            validator: FspiopAmountConstraint,
        });
    };
}

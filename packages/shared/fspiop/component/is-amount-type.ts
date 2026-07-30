// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import { SubScenario, AmountType } from '@shared/fspiop/dto';


@ValidatorConstraint({name: 'isAmountType', async: false})
export class AmountTypeConstraint implements ValidatorConstraintInterface {
    constructor(private readonly strictAmountType = false) {}

    validate(value: unknown, args: ValidationArguments): boolean {
        // This validator should only work if STRICT_AMOUNT_TYPE env is true
        if (!this.strictAmountType) {
            return true;
        }
        
        const reqBody = args.object as { subScenario: string };
        // PERSON_TO_PERSON > RECEIVE
        // PERSON_TO_BUSINESS > SEND
        return (reqBody.subScenario === SubScenario.personToPerson && value === AmountType.Receive) || 
            (reqBody.subScenario === SubScenario.personToBusiness && value === AmountType.Send);
    }

    defaultMessage(args: ValidationArguments): string {
        return `Invalid ${args.property} value`;
    }
}

export function IsAmountType(options?: ValidationOptions): PropertyDecorator {
    return (target: object, propertyKey: string | symbol): void => {
        registerDecorator({
            name: 'isAmountType',
            target: target.constructor,
            propertyName: propertyKey as string,
            options,
            constraints: [],
            validator: AmountTypeConstraint,
        });
    };
}
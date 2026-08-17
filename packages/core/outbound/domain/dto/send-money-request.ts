// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Transform, Type } from 'class-transformer';
import {
    IsDefined,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    Validate,
    ValidateNested,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import { AmountType, Currency, FspiopMoney, IsFspiopAmount, TransactionScenario, IsAmountType } from '@shared/fspiop';
import { FspParty } from './fsp-party';

@ValidatorConstraint({name: 'hasPayerFspId', async: false})
class HasPayerFspIdConstraint implements ValidatorConstraintInterface {
    validate(value: unknown): boolean {
        const fspId = (value as FspParty | undefined)?.fspId;
        return typeof fspId === 'string' && fspId.length > 0;
    }

    defaultMessage(): string {
        return 'from.fspId is required';
    }
}

export class SendMoneyRequest {
    @IsNotEmpty()
    @IsString()
    @MaxLength(128, {message: 'homeTransactionId must not exceed 128 characters'})
    homeTransactionId!: string;

    @IsDefined()
    @ValidateNested()
    @Validate(HasPayerFspIdConstraint)
    @Type(() => FspParty)
    from!: FspParty;

    @IsDefined()
    @ValidateNested()
    @Type(() => FspParty)
    to!: FspParty;

    @IsDefined()
    @IsEnum(AmountType)
    @IsAmountType()
    amountType!: AmountType;

    @IsDefined()
    @IsEnum(Currency)
    currency!: Currency;

    @Transform(({ value }) => typeof value === 'string' || typeof value === 'number' ? FspiopMoney.normalizeAmount(value) : value)
    @IsFspiopAmount()
    amount!: string;

    @IsDefined()
    @IsEnum(TransactionScenario)
    transactionType!: TransactionScenario;

    // FSPIOP TransactionSubScenario is pattern ^[A-Z_]{1,32}$ — max 32 (well under the
    // sub_scenario audit column's 128).
    @IsNotEmpty()
    @IsString()
    @MaxLength(32, {message: 'subScenario must not exceed 32 characters'})
    subScenario!: string;

    @IsOptional()
    @IsString()
    @MaxLength(128, {message: 'note must not exceed 128 characters'})
    note?: string;
}

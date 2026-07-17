// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import { Transform, Type } from 'class-transformer';
import { IsDefined, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AmountType, Currency, FspiopMoney, IsFspiopAmount, TransactionScenario } from '@shared/fspiop';
import { FspParty } from './fsp-party';

export class SendMoneyRequest {
    @IsNotEmpty()
    @IsString()
    @MaxLength(128, {message: 'homeTransactionId must not exceed 128 characters'})
    homeTransactionId!: string;

    @IsDefined()
    @ValidateNested()
    @Type(() => FspParty)
    from!: FspParty;

    @IsDefined()
    @ValidateNested()
    @Type(() => FspParty)
    to!: FspParty;

    @IsDefined()
    @IsEnum(AmountType)
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

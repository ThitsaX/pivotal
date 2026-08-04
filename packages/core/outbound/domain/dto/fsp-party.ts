// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Type} from 'class-transformer';
import {
    IsArray,
    IsDefined,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Validate,
    ValidateNested,
    ValidationArguments,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import {Extension, PartyIdType, TransactionInitiatorType} from '@shared/fspiop';

const SAFE_IDENTIFIER_TEXT = /^[^\p{Cc}\p{Cf}\p{Cs}]+$/u;
const SIMPLE_IDENTIFIER = /^[A-Za-z0-9_-]+$/;

@ValidatorConstraint({name: 'isBusinessOrAliasId', async: false})
class BusinessOrAliasIdConstraint implements ValidatorConstraintInterface {
    validate(value: unknown, args: ValidationArguments): boolean {
        const {idType} = args.object as FspParty;
        if (idType !== PartyIdType.Business && idType !== PartyIdType.Alias) {
            return true;
        }

        return typeof value === 'string' && SIMPLE_IDENTIFIER.test(value);
    }

    defaultMessage(): string {
        return 'idValue for BUSINESS or ALIAS must contain only letters, numbers, underscores, or hyphens';
    }
}

export class FspParty {
    @IsOptional()
    @IsEnum(TransactionInitiatorType)
    type?: TransactionInitiatorType;

    @IsDefined()
    @IsEnum(PartyIdType)
    idType!: PartyIdType;

    @IsNotEmpty()
    @IsString()
    @MaxLength(128, {message: 'idValue must not exceed 128 characters'})
    @Matches(SAFE_IDENTIFIER_TEXT, {message: 'idValue must not contain control or formatting characters'})
    @Validate(BusinessOrAliasIdConstraint)
    idValue!: string;

    @IsOptional()
    @IsString()
    @MaxLength(128, {message: 'idSubValue must not exceed 128 characters'})
    idSubValue?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128, {message: 'displayName must not exceed 128 characters'})
    displayName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128, {message: 'firstName must not exceed 128 characters'})
    firstName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128, {message: 'middleName must not exceed 128 characters'})
    middleName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128, {message: 'lastName must not exceed 128 characters'})
    lastName?: string;

    @IsOptional()
    @IsString()
    dateOfBirth?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4, {message: 'merchantClassificationCode must not exceed 4 characters'})
    merchantClassificationCode?: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(32, {message: 'fspId must not exceed 32 characters'})
    @Matches(SIMPLE_IDENTIFIER, {message: 'fspId must contain only letters, numbers, underscores, or hyphens'})
    fspId!: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({each: true})
    @Type(() => Extension)
    extensionList?: Array<Extension>;
}

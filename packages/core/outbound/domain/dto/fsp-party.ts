// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Type} from 'class-transformer';
import {IsArray, IsDefined, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateNested} from 'class-validator';
import {Extension, PartyIdType, TransactionInitiatorType} from '@shared/fspiop';

const SAFE_IDENTIFIER_TEXT = /^[^\p{Cc}\p{Cf}\p{Cs}]+$/u;
const FSP_ID = /^[A-Za-z0-9_-]+$/;

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
    @Matches(FSP_ID, {message: 'fspId must contain only letters, numbers, underscores, or hyphens'})
    fspId!: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({each: true})
    @Type(() => Extension)
    extensionList?: Array<Extension>;
}

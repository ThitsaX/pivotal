import {Type} from 'class-transformer';
import {IsArray, IsDefined, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested} from 'class-validator';
import {Extension, PartyIdType, TransactionInitiatorType} from '@shared/fspiop';

export class FspParty {
    @IsOptional()
    @IsEnum(TransactionInitiatorType)
    type?: TransactionInitiatorType;

    @IsDefined()
    @IsEnum(PartyIdType)
    idType!: PartyIdType;

    @IsNotEmpty()
    @IsString()
    idValue!: string;

    @IsOptional()
    @IsString()
    idSubValue?: string;

    @IsOptional()
    @IsString()
    displayName?: string;

    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    middleName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsOptional()
    @IsString()
    dateOfBirth?: string;

    @IsOptional()
    @IsString()
    merchantClassificationCode?: string;

    @IsNotEmpty()
    @IsString()
    fspId!: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({each: true})
    @Type(() => Extension)
    extensionList?: Array<Extension>;
}

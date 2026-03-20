import {Type} from 'class-transformer';
import {IsArray, IsOptional, IsString, ValidateNested} from 'class-validator';
import {Money} from '@shared/fspiop';
import {FspParty} from './fsp-party';

export class SendMoneyResponse {
    @IsOptional()
    @IsString()
    transferId?: string;

    @IsOptional()
    @IsString()
    @ValidateNested()
    @Type(() => FspParty)
    to?: FspParty;

    @IsOptional()
    @ValidateNested()
    @Type(() => Money)
    schemeFee?: Money;

    @IsOptional()
    @IsArray()
    @IsString({each: true})
    supportedCurrencies?: Array<string>;
}

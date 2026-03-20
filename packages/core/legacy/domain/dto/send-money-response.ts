import {Type} from 'class-transformer';
import {IsArray, IsDefined, IsEnum, IsOptional, IsString, ValidateNested} from 'class-validator';
import {AmountType, Currency, Extension} from '@shared/fspiop';
import {FspParty} from './fsp-party';

export class SendMoneyResponse {
    @IsOptional()
    @IsString()
    transferId?: string;

    @IsOptional()
    @IsString()
    homeTransactionId?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => FspParty)
    from?: FspParty;

    @IsOptional()
    @ValidateNested()
    @Type(() => FspParty)
    to?: FspParty;

    @IsOptional()
    @IsEnum(AmountType)
    amountType?: AmountType;

    @IsOptional()
    @IsString()
    transactionType?: string;

    @IsOptional()
    @IsString()
    note?: string;

    @IsDefined()
    @IsString()
    amount!: string;

    @IsOptional()
    @IsString()
    payeeFspFeeAmount?: string;

    @IsOptional()
    @IsEnum(Currency)
    currency?: Currency;

    @IsOptional()
    @IsString()
    initiatedTimestamp?: string;

    @IsOptional()
    @IsString()
    direction?: string;

    @IsOptional()
    @IsArray()
    @IsString({each: true})
    supportedCurrencies?: Array<string>;

    @IsOptional()
    @IsArray()
    @ValidateNested({each: true})
    @Type(() => Extension)
    extensionList?: Array<Extension>;
}

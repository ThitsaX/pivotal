import { Type } from 'class-transformer';
import { IsArray, IsDefined, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AmountType, Currency, Extension, TransactionScenario } from '@shared/fspiop';
import { FspParty } from './fsp-party';

export enum StateEnum {
    WaitingForPartyAcceptance = 'WAITING_FOR_PARTY_ACCEPTANCE',
    WaitingForQuoteAcceptance = 'WAITING_FOR_QUOTE_ACCEPTANCE',
    Completed = 'COMPLETED',
    Aborted = 'ABORTED',
}

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
    @IsEnum(TransactionScenario)
    transactionType?: TransactionScenario;

    @IsOptional()
    @IsString()
    subScenario?: string;

    @IsOptional()
    @IsString()
    note?: string;

    @IsDefined()
    @IsString()
    amount!: string;

    @IsOptional()
    @IsString()
    payeeReceiveAmount?: string;

    @IsOptional()
    @IsString()
    transferAmount?: string;

    @IsOptional()
    @IsString()
    payeeFee?: string;

    @IsOptional()
    @IsString()
    payerFee?: string;

    @IsOptional()
    @IsString()
    schemeFee?: string;

    @IsOptional()
    @IsEnum(Currency)
    currency?: Currency;

    @IsOptional()
    @IsEnum(StateEnum)
    currentState?: StateEnum;

    @IsOptional()
    @IsString()
    initiatedTimestamp?: string;

    @IsOptional()
    @IsString()
    direction?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    supportedCurrencies?: Array<string>;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => Extension)
    extensionList?: Array<Extension>;
}

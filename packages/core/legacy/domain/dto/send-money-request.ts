import {Type} from 'class-transformer';
import {IsDefined, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested} from 'class-validator';
import {AmountType, Currency, TransactionScenario} from '@shared/fspiop';
import {FspParty} from './fsp-party';

export class SendMoneyRequest {
    @IsNotEmpty()
    @IsString()
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

    @IsDefined()
    @IsString()
    amount!: string;

    @IsDefined()
    @IsEnum(TransactionScenario)
    transactionType!: TransactionScenario;

    @IsNotEmpty()
    @IsString()
    subScenario!: string;

    @IsOptional()
    @IsString()
    note?: string;
}

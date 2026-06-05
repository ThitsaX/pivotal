import { Transform, Type } from 'class-transformer';
import { IsDefined, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AmountType, Currency, FspiopMoney, IsFspiopAmount, TransactionScenario } from '@shared/fspiop';
import { FspParty } from './fsp-party';

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

    @Transform(({ value }) => typeof value === 'string' ? FspiopMoney.normalizeAmount(value) : value)
    @IsFspiopAmount()
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

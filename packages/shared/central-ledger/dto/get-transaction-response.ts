import {ApiProperty} from '@nestjs/swagger';
import {ExtensionList, Money, Party, TransactionType} from '@shared/fspiop';
import {QuoteId} from './quote-id';
import {TransactionId} from './transaction-id';

export class GetTransactionResponse {

    @ApiProperty({type: String, required: false})
    quoteId?: QuoteId;

    @ApiProperty({type: String, required: false})
    transactionId?: TransactionId;

    @ApiProperty({type: String, required: false})
    transactionRequestId?: string;

    @ApiProperty({type: () => Party, required: false})
    payee?: Party;

    @ApiProperty({type: () => Party, required: false})
    payer?: Party;

    @ApiProperty({type: () => Money, required: false})
    amount?: Money;

    @ApiProperty({type: () => TransactionType, required: false})
    transactionType?: TransactionType;

    @ApiProperty({type: String, required: false})
    note?: string;

    @ApiProperty({type: () => ExtensionList, required: false})
    extensionList?: ExtensionList;
}

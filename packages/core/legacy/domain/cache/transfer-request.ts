import {AmountType, Currency, Party, QuotesIDPutResponse, TransactionScenario, TransfersIDPutResponse} from '@shared/fspiop';
import {FspParty} from '../dto';

export class TransferRequest {

    payer!: Party;

    payee!: Party;

    quotes?: QuotesIDPutResponse;

    transfer?: TransfersIDPutResponse;

    transferId!: string;

    homeTransactionId!: string;

    from!: FspParty;

    to!: FspParty;

    amountType!: AmountType;

    currency!: Currency;

    amount!: string;

    transactionType!: TransactionScenario;

    subScenario!: string;

    note?: string;

    supportedCurrencies?: Array<string>;
}

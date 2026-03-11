import {AmountType, Currency, PartyIdInfo} from '../dto';

export class FspiopAgreement {
    constructor(
        public readonly quoteId: string,
        public readonly currency: Currency,
        public readonly transferAmount: string,
        public readonly amountType: AmountType,
        public readonly originalAmount: string,
        public readonly payeeFspFee: string,
        public readonly payeeFspCommission: string,
        public readonly payer: PartyIdInfo,
        public readonly payee: PartyIdInfo,
    ) {
    }
}

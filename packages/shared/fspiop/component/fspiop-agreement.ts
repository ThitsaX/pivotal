// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {AmountType, Money, PartyIdInfo, TransactionScenario} from '../dto';

export class FspiopAgreement {
    constructor(
        public readonly quoteId: string,
        public readonly payer: PartyIdInfo,
        public readonly payee: PartyIdInfo,
        public readonly amountType: AmountType,
        public readonly scenario: TransactionScenario,
        public readonly subScenario: string | undefined,
        public readonly originalAmount: Money,
        public readonly payeeFspFee: Money,
        public readonly payeeFspCommission: Money,
        public readonly payeeReceiveAmount: Money,
        public readonly transferAmount: Money,
        public readonly expireAt: number,
    ) {
    }
}

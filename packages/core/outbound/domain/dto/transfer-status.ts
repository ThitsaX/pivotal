// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Currency} from '@shared/fspiop';
import {StateEnum} from './send-money-response';

export class TransferStatusError {
    statusCode!: string;
    message!: string;
    localeMessage!: string;
    detailedDescription!: string;
}

export class TransferStatusResponse {
    transferId!: string;
    homeTransactionId!: string | null;
    currentState!: StateEnum;
    possibleDispute!: boolean;
    amount!: string | null;
    currency!: Currency | null;
    initiatedTimestamp!: string;
    errorInformation!: TransferStatusError | null;
}

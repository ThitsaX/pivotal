// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Transaction} from '@core/audit/domain/model';
import {PIVOTAL_DB_READ_CONNECTION_NAME} from '@core/audit/domain/repository';
import {Repository} from 'typeorm';

export interface TransferStatusRecord {
    payerFsp: string;
    payeeFsp: string;
    payerHomeTransactionId: string | null;
    payeeHomeTransactionId: string | null;
    quotingCurrency: string | null;
    quotingAmount: string | null;
    transferState: string | null;
    flow: number | string | null;
    transactionStartedAt: Date | string;
    possibleDispute: boolean | number;
    error: boolean | number;
    partiesError: unknown | null;
    partiesRespondedAt: Date | string | null;
    quotesRequestedAt: Date | string | null;
    quotesRespondedAt: Date | string | null;
    quotesError: unknown | null;
    transfersRequestedAt: Date | string | null;
    transfersError: unknown | null;
    patchError: unknown | null;
}

@Injectable()
export class TransferStatusRepository {

    constructor(
        @InjectRepository(Transaction, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly repository: Repository<Transaction>,
    ) {
    }

    async get(transferId: string): Promise<TransferStatusRecord | null> {
        const record = await this.repository.createQueryBuilder('transaction')
            .select('transaction.payerFsp', 'payerFsp')
            .addSelect('transaction.payeeFsp', 'payeeFsp')
            .addSelect('transaction.payerHomeTransactionId', 'payerHomeTransactionId')
            .addSelect('transaction.payeeHomeTransactionId', 'payeeHomeTransactionId')
            .addSelect('transaction.quotingCurrency', 'quotingCurrency')
            .addSelect('transaction.quotingAmount', 'quotingAmount')
            .addSelect('transaction.transferState', 'transferState')
            .addSelect('transaction.flow', 'flow')
            .addSelect('transaction.transactionStartedAt', 'transactionStartedAt')
            .addSelect('transaction.possibleDispute', 'possibleDispute')
            .addSelect('transaction.error', 'error')
            .addSelect('transaction.partiesError', 'partiesError')
            .addSelect('transaction.partiesRespondedAt', 'partiesRespondedAt')
            .addSelect('transaction.quotesRequestedAt', 'quotesRequestedAt')
            .addSelect('transaction.quotesRespondedAt', 'quotesRespondedAt')
            .addSelect('transaction.quotesError', 'quotesError')
            .addSelect('transaction.transfersRequestedAt', 'transfersRequestedAt')
            .addSelect('transaction.transfersError', 'transfersError')
            .addSelect('transaction.patchError', 'patchError')
            .where('transaction.correlationId = :transferId', {transferId})
            .getRawOne<TransferStatusRecord>();

        return record ?? null;
    }
}

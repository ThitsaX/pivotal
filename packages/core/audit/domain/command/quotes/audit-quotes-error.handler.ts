// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditQuotesErrorCommand} from './audit-quotes-error.command';
import {AuditTransactionMapper} from '../transaction/audit-transaction.mapper';

@CommandHandler(AuditQuotesErrorCommand)
export class AuditQuotesErrorHandler
    implements ICommandHandler<AuditQuotesErrorCommand, AuditQuotesErrorCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditQuotesErrorCommand): Promise<AuditQuotesErrorCommand.Output> {
        await this.transactionRepository.upsert(
            AuditTransactionMapper.toQuotesErrorInput(command.input),
        );

        return new AuditQuotesErrorCommand.Output();
    }
}

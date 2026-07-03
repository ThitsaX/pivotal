// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditQuotesResponseCommand} from './audit-quotes-response.command';
import {AuditTransactionMapper} from '../transaction/audit-transaction.mapper';

@CommandHandler(AuditQuotesResponseCommand)
export class AuditQuotesResponseHandler
    implements ICommandHandler<AuditQuotesResponseCommand, AuditQuotesResponseCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditQuotesResponseCommand): Promise<AuditQuotesResponseCommand.Output> {
        await this.transactionRepository.upsert(
            AuditTransactionMapper.toQuotesResponseInput(command.input),
        );

        return new AuditQuotesResponseCommand.Output();
    }
}

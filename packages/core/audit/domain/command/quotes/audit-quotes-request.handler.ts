// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditQuotesRequestCommand} from './audit-quotes-request.command';
import {AuditTransactionMapper} from '../transaction/audit-transaction.mapper';

@CommandHandler(AuditQuotesRequestCommand)
export class AuditQuotesRequestHandler
    implements ICommandHandler<AuditQuotesRequestCommand, AuditQuotesRequestCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditQuotesRequestCommand): Promise<AuditQuotesRequestCommand.Output> {
        await this.transactionRepository.upsert(
            AuditTransactionMapper.toQuotesRequestInput(command.input),
        );

        return new AuditQuotesRequestCommand.Output();
    }
}

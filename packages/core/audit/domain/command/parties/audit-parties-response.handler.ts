// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditPartiesResponseCommand} from './audit-parties-response.command';
import {AuditTransactionMapper} from '../transaction/audit-transaction.mapper';

@CommandHandler(AuditPartiesResponseCommand)
export class AuditPartiesResponseHandler
    implements ICommandHandler<AuditPartiesResponseCommand, AuditPartiesResponseCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditPartiesResponseCommand): Promise<AuditPartiesResponseCommand.Output> {
        await this.transactionRepository.upsert(
            AuditTransactionMapper.toPartiesResponseInput(command.input),
        );

        return new AuditPartiesResponseCommand.Output();
    }
}

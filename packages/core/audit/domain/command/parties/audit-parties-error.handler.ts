// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditPartiesErrorCommand} from './audit-parties-error.command';
import {AuditTransactionMapper} from '../transaction/audit-transaction.mapper';

@CommandHandler(AuditPartiesErrorCommand)
export class AuditPartiesErrorHandler
    implements ICommandHandler<AuditPartiesErrorCommand, AuditPartiesErrorCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditPartiesErrorCommand): Promise<AuditPartiesErrorCommand.Output> {
        await this.transactionRepository.upsert(
            AuditTransactionMapper.toPartiesErrorInput(command.input),
        );

        return new AuditPartiesErrorCommand.Output();
    }
}

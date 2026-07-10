// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditPartiesRequestCommand} from './audit-parties-request.command';
import {AuditTransactionMapper} from '../transaction/audit-transaction.mapper';

@CommandHandler(AuditPartiesRequestCommand)
export class AuditPartiesRequestHandler
    implements ICommandHandler<AuditPartiesRequestCommand, AuditPartiesRequestCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditPartiesRequestCommand): Promise<AuditPartiesRequestCommand.Output> {
        await this.transactionRepository.upsert(
            AuditTransactionMapper.toPartiesRequestInput(command.input),
        );

        return new AuditPartiesRequestCommand.Output();
    }
}

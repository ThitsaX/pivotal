// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditTransactionMapper} from '../transaction/audit-transaction.mapper';
import {AuditPatchRequestCommand} from './audit-patch-request.command';

@CommandHandler(AuditPatchRequestCommand)
export class AuditPatchRequestHandler
    implements ICommandHandler<AuditPatchRequestCommand, AuditPatchRequestCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditPatchRequestCommand): Promise<AuditPatchRequestCommand.Output> {
        await this.transactionRepository.upsert(
            AuditTransactionMapper.toPatchRequestInput(command.input),
        );

        return new AuditPatchRequestCommand.Output();
    }
}

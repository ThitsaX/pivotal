// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditTransactionMapper} from '../transaction/audit-transaction.mapper';
import {AuditPatchResponseCommand} from './audit-patch-response.command';

@CommandHandler(AuditPatchResponseCommand)
export class AuditPatchResponseHandler
    implements ICommandHandler<AuditPatchResponseCommand, AuditPatchResponseCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditPatchResponseCommand): Promise<AuditPatchResponseCommand.Output> {
        await this.transactionRepository.upsert(
            AuditTransactionMapper.toPatchResponseInput(command.input),
        );

        return new AuditPatchResponseCommand.Output();
    }
}

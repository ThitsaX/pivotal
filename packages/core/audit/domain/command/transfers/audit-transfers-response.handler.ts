// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditTransfersResponseCommand} from './audit-transfers-response.command';
import {AuditTransactionMapper} from '../transaction/audit-transaction.mapper';

@CommandHandler(AuditTransfersResponseCommand)
export class AuditTransfersResponseHandler
    implements ICommandHandler<AuditTransfersResponseCommand, AuditTransfersResponseCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditTransfersResponseCommand): Promise<AuditTransfersResponseCommand.Output> {
        await this.transactionRepository.upsert(
            AuditTransactionMapper.toTransfersResponseInput(command.input),
        );

        return new AuditTransfersResponseCommand.Output();
    }
}

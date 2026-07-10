// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditTransfersRequestCommand} from './audit-transfers-request.command';
import {AuditTransactionMapper} from '../transaction/audit-transaction.mapper';

@CommandHandler(AuditTransfersRequestCommand)
export class AuditTransfersRequestHandler
    implements ICommandHandler<AuditTransfersRequestCommand, AuditTransfersRequestCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditTransfersRequestCommand): Promise<AuditTransfersRequestCommand.Output> {
        await this.transactionRepository.upsert(
            AuditTransactionMapper.toTransfersRequestInput(command.input),
        );

        return new AuditTransfersRequestCommand.Output();
    }
}

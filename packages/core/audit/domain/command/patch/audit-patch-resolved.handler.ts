// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject, Logger} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditPatchResolvedCommand} from './audit-patch-resolved.command';

@CommandHandler(AuditPatchResolvedCommand)
export class AuditPatchResolvedHandler
    implements ICommandHandler<AuditPatchResolvedCommand, AuditPatchResolvedCommand.Output> {

    private readonly logger = new Logger(AuditPatchResolvedHandler.name);

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditPatchResolvedCommand): Promise<AuditPatchResolvedCommand.Output> {
        const resolved = await this.transactionRepository.resolveDispute(
            command.input.correlationId,
            command.input.occurredAt,
        );

        if (!resolved) {
            this.logger.error(
                `No transaction found for resolved patch transferId='${command.input.correlationId}'.`,
            );
        }

        return new AuditPatchResolvedCommand.Output(resolved);
    }
}

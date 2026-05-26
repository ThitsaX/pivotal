import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditTransactionMapper} from '../transaction/audit-transaction.mapper';
import {AuditPatchErrorCommand} from './audit-patch-error.command';

@CommandHandler(AuditPatchErrorCommand)
export class AuditPatchErrorHandler
    implements ICommandHandler<AuditPatchErrorCommand, AuditPatchErrorCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditPatchErrorCommand): Promise<AuditPatchErrorCommand.Output> {
        await this.transactionRepository.upsert(
            AuditTransactionMapper.toPatchErrorInput(command.input),
        );

        return new AuditPatchErrorCommand.Output();
    }
}

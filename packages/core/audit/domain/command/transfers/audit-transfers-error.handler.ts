import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {AuditTransfersErrorCommand} from './audit-transfers-error.command';
import {AuditTransactionMapper} from '../transaction/audit-transaction.mapper';

@CommandHandler(AuditTransfersErrorCommand)
export class AuditTransfersErrorHandler
    implements ICommandHandler<AuditTransfersErrorCommand, AuditTransfersErrorCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: AuditTransfersErrorCommand): Promise<AuditTransfersErrorCommand.Output> {
        await this.transactionRepository.upsert(
            AuditTransactionMapper.toTransfersErrorInput(command.input),
        );

        return new AuditTransfersErrorCommand.Output();
    }
}

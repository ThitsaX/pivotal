import {Inject, NotFoundException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionRepository} from '../../repository';
import {DisputeTransactionCommand} from './dispute-transaction.command';

@CommandHandler(DisputeTransactionCommand)
export class DisputeTransactionHandler
    implements ICommandHandler<DisputeTransactionCommand, DisputeTransactionCommand.Output> {

    constructor(
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
    ) {
    }

    async execute(command: DisputeTransactionCommand): Promise<DisputeTransactionCommand.Output> {
        const transaction = await this.transactionRepository.dispute(command.input.correlationId);

        if (transaction == null) {
            throw new NotFoundException(`Transaction ${command.input.correlationId} was not found.`);
        }

        return new DisputeTransactionCommand.Output(transaction.id);
    }
}

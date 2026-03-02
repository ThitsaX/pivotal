import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutTransfersErrorCommand} from './handle-put-transfers-error.command';

@CommandHandler(HandlePutTransfersErrorCommand)
export class HandlePutTransfersErrorHandler
    implements ICommandHandler<HandlePutTransfersErrorCommand, HandlePutTransfersErrorCommand.Output>
{

    constructor(
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutTransfersErrorCommand): Promise<HandlePutTransfersErrorCommand.Output> {
        const {payerFsp, payeeFsp, transferId, error} = command.input;

        if (error == null) {
            return new HandlePutTransfersErrorCommand.Output();
        }

        const subject = FspiopPubSubSubjects.Transfers.forError(
            payerFsp,
            payeeFsp,
            transferId,
        );

        this.publisher.publishError(subject, error);

        return new HandlePutTransfersErrorCommand.Output();
    }
}

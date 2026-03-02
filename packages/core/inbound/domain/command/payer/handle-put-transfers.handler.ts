import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutTransfersCommand} from './handle-put-transfers.command';

@CommandHandler(HandlePutTransfersCommand)
export class HandlePutTransfersHandler
    implements ICommandHandler<HandlePutTransfersCommand, HandlePutTransfersCommand.Output>
{

    constructor(
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutTransfersCommand): Promise<HandlePutTransfersCommand.Output> {
        const {payerFsp, payeeFsp, transferId, response} = command.input;

        if (response == null) {
            return new HandlePutTransfersCommand.Output();
        }

        const subject = FspiopPubSubSubjects.Transfers.forSuccess(
            payerFsp,
            payeeFsp,
            transferId,
        );

        this.publisher.publishSuccess(subject, response);

        return new HandlePutTransfersCommand.Output();
    }
}

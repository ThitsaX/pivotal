import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutPartiesErrorCommand} from './handle-put-parties-error.command';

@CommandHandler(HandlePutPartiesErrorCommand)
export class HandlePutPartiesErrorHandler
    implements ICommandHandler<HandlePutPartiesErrorCommand, HandlePutPartiesErrorCommand.Output> {

    constructor(
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutPartiesErrorCommand): Promise<HandlePutPartiesErrorCommand.Output> {
        const {payerFsp, payeeFsp, partyIdType, partyId, subId, error} = command.input;

        if (error == null) {
            return new HandlePutPartiesErrorCommand.Output();
        }

        const subject = FspiopPubSubSubjects.Parties.forError(
            payerFsp,
            payeeFsp,
            partyIdType,
            partyId,
            subId ?? undefined,
        );

        this.publisher.publishError(subject, error);

        return new HandlePutPartiesErrorCommand.Output();
    }
}

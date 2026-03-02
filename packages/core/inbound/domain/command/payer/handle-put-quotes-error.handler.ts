import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutQuotesErrorCommand} from './handle-put-quotes-error.command';

@CommandHandler(HandlePutQuotesErrorCommand)
export class HandlePutQuotesErrorHandler
    implements ICommandHandler<HandlePutQuotesErrorCommand, HandlePutQuotesErrorCommand.Output>
{

    constructor(
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutQuotesErrorCommand): Promise<HandlePutQuotesErrorCommand.Output> {
        const {payerFsp, payeeFsp, quoteId, error} = command.input;

        if (error == null) {
            return new HandlePutQuotesErrorCommand.Output();
        }

        const subject = FspiopPubSubSubjects.Quotes.forError(
            payerFsp,
            payeeFsp,
            quoteId,
        );

        this.publisher.publishError(subject, error);

        return new HandlePutQuotesErrorCommand.Output();
    }
}

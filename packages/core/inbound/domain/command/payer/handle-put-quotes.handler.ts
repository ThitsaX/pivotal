import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutQuotesCommand} from './handle-put-quotes.command';

@CommandHandler(HandlePutQuotesCommand)
export class HandlePutQuotesHandler
    implements ICommandHandler<HandlePutQuotesCommand, HandlePutQuotesCommand.Output> {

    constructor(
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutQuotesCommand): Promise<HandlePutQuotesCommand.Output> {
        const {payerFsp, quoteId, response} = command.input;

        if (response == null) {
            return new HandlePutQuotesCommand.Output();
        }

        const subject = FspiopPubSubSubjects.Quotes.forSuccess(
            payerFsp,
            quoteId,
        );

        this.publisher.publishSuccess(subject, response);

        return new HandlePutQuotesCommand.Output();
    }
}

import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {InboundQuotesPublisher} from '../../publisher';
import {HandlePostQuotesCommand} from './handle-post-quotes.command';

@CommandHandler(HandlePostQuotesCommand)
export class HandlePostQuotesHandler
    implements ICommandHandler<HandlePostQuotesCommand, HandlePostQuotesCommand.Output> {

    constructor(private readonly publisher: InboundQuotesPublisher) {
    }

    async execute(command: HandlePostQuotesCommand): Promise<HandlePostQuotesCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, request} = command.input;
        await this.publisher.publish(new InboundQuotesPublisher.Input(payerFsp, payeeFsp, correlationId, request));
        return new HandlePostQuotesCommand.Output();
    }
}

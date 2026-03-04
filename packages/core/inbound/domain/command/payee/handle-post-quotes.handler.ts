import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {InboundConnectorQuotesPublisher} from '../../publisher';
import {HandlePostQuotesCommand} from './handle-post-quotes.command';

@CommandHandler(HandlePostQuotesCommand)
export class HandlePostQuotesHandler
    implements ICommandHandler<HandlePostQuotesCommand, HandlePostQuotesCommand.Output> {

    constructor(private readonly publisher: InboundConnectorQuotesPublisher) {
    }

    async execute(command: HandlePostQuotesCommand): Promise<HandlePostQuotesCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, request} = command.input;
        await this.publisher.publish(new InboundConnectorQuotesPublisher.Message(payerFsp, payeeFsp, correlationId, request));
        return new HandlePostQuotesCommand.Output();
    }
}

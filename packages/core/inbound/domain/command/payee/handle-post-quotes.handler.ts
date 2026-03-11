import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {ConnectorPostQuotesPublisher} from '@core/connector/publisher';
import {HandlePostQuotesCommand} from './handle-post-quotes.command';

@CommandHandler(HandlePostQuotesCommand)
export class HandlePostQuotesHandler
    implements ICommandHandler<HandlePostQuotesCommand, HandlePostQuotesCommand.Output> {

    constructor(
        @Inject(ConnectorPostQuotesPublisher)
        private readonly publisher: ConnectorPostQuotesPublisher,
    ) {
    }

    async execute(command: HandlePostQuotesCommand): Promise<HandlePostQuotesCommand.Output> {
        const {payerFsp, payeeFsp, request} = command.input;
        await this.publisher.publish(new ConnectorPostQuotesPublisher.Message(payerFsp, payeeFsp, request));
        return new HandlePostQuotesCommand.Output();
    }
}

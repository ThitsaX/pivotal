import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {HandlePostQuotesCommand} from './handle-post-quotes.command';
import {FspClient} from '../fsp-client';

@CommandHandler(HandlePostQuotesCommand)
export class HandlePostQuotesHandler
    implements ICommandHandler<HandlePostQuotesCommand, HandlePostQuotesCommand.Output> {

    constructor(private readonly fspClient: FspClient) {
    }

    async execute(command: HandlePostQuotesCommand): Promise<HandlePostQuotesCommand.Output> {
        const {request} = command.input;

        await this.fspClient.postQuotes(request);

        return new HandlePostQuotesCommand.Output();
    }
}

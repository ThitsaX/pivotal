import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {HandlePostTransfersCommand} from './handle-post-transfers.command';
import {FspClient} from '../fsp-client';

@CommandHandler(HandlePostTransfersCommand)
export class HandlePostTransfersHandler
    implements ICommandHandler<HandlePostTransfersCommand, HandlePostTransfersCommand.Output> {

    constructor(private readonly fspClient: FspClient) {
    }

    async execute(command: HandlePostTransfersCommand): Promise<HandlePostTransfersCommand.Output> {
        const {request} = command.input;

        await this.fspClient.postTransfers(request);

        return new HandlePostTransfersCommand.Output();
    }
}

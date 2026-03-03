import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {InboundTransfersPublisher} from '../../publisher';
import {HandlePostTransfersCommand} from './handle-post-transfers.command';

@CommandHandler(HandlePostTransfersCommand)
export class HandlePostTransfersHandler
    implements ICommandHandler<HandlePostTransfersCommand, HandlePostTransfersCommand.Output> {

    constructor(private readonly publisher: InboundTransfersPublisher) {
    }

    async execute(command: HandlePostTransfersCommand): Promise<HandlePostTransfersCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, request} = command.input;
        await this.publisher.publish(new InboundTransfersPublisher.Input(payerFsp, payeeFsp, correlationId, request));
        return new HandlePostTransfersCommand.Output();
    }
}

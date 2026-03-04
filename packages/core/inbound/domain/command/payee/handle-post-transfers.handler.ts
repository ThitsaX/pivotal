import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {InboundConnectorTransfersPublisher} from '../../publisher';
import {HandlePostTransfersCommand} from './handle-post-transfers.command';

@CommandHandler(HandlePostTransfersCommand)
export class HandlePostTransfersHandler
    implements ICommandHandler<HandlePostTransfersCommand, HandlePostTransfersCommand.Output> {

    constructor(private readonly publisher: InboundConnectorTransfersPublisher) {
    }

    async execute(command: HandlePostTransfersCommand): Promise<HandlePostTransfersCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, request} = command.input;
        await this.publisher.publish(new InboundConnectorTransfersPublisher.Message(payerFsp, payeeFsp, correlationId, request));
        return new HandlePostTransfersCommand.Output();
    }
}

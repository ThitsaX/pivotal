import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {InboundConnectorPatchTransfersPublisher} from '../../publisher';
import {HandlePatchTransfersCommand} from './handle-patch-transfers.command';

@CommandHandler(HandlePatchTransfersCommand)
export class HandlePatchTransfersHandler
    implements ICommandHandler<HandlePatchTransfersCommand, HandlePatchTransfersCommand.Output> {

    constructor(private readonly publisher: InboundConnectorPatchTransfersPublisher) {}

    async execute(command: HandlePatchTransfersCommand): Promise<HandlePatchTransfersCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, response} = command.input;
        await this.publisher.publish(new InboundConnectorPatchTransfersPublisher.Message(payerFsp, payeeFsp, correlationId, response));
        return new HandlePatchTransfersCommand.Output();
    }
}

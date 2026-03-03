import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {InboundPatchTransfersPublisher} from '../../publisher';
import {HandlePatchTransfersCommand} from './handle-patch-transfers.command';

@CommandHandler(HandlePatchTransfersCommand)
export class HandlePatchTransfersHandler
    implements ICommandHandler<HandlePatchTransfersCommand, HandlePatchTransfersCommand.Output> {

    constructor(private readonly publisher: InboundPatchTransfersPublisher) {}

    async execute(command: HandlePatchTransfersCommand): Promise<HandlePatchTransfersCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, response} = command.input;
        await this.publisher.publish(new InboundPatchTransfersPublisher.Input(payerFsp, payeeFsp, correlationId, response));
        return new HandlePatchTransfersCommand.Output();
    }
}

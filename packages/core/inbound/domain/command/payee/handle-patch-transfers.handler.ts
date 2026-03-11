import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {ConnectorPatchTransfersPublisher} from '@core/connector/publisher';
import {HandlePatchTransfersCommand} from './handle-patch-transfers.command';

@CommandHandler(HandlePatchTransfersCommand)
export class HandlePatchTransfersHandler
    implements ICommandHandler<HandlePatchTransfersCommand, HandlePatchTransfersCommand.Output> {

    constructor(
        @Inject(ConnectorPatchTransfersPublisher)
        private readonly publisher: ConnectorPatchTransfersPublisher,
    ) {}

    async execute(command: HandlePatchTransfersCommand): Promise<HandlePatchTransfersCommand.Output> {
        const {payerFsp, payeeFsp, transferId, response} = command.input;
        await this.publisher.publish(
            new ConnectorPatchTransfersPublisher.Message(payerFsp, payeeFsp, transferId, response),
        );
        return new HandlePatchTransfersCommand.Output();
    }
}

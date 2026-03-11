import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {ConnectorPostTransfersPublisher} from '@core/connector/publisher';
import {HandlePostTransfersCommand} from './handle-post-transfers.command';

@CommandHandler(HandlePostTransfersCommand)
export class HandlePostTransfersHandler
    implements ICommandHandler<HandlePostTransfersCommand, HandlePostTransfersCommand.Output> {

    constructor(
        @Inject(ConnectorPostTransfersPublisher)
        private readonly publisher: ConnectorPostTransfersPublisher,
    ) {
    }

    async execute(command: HandlePostTransfersCommand): Promise<HandlePostTransfersCommand.Output> {
        const {payerFsp, payeeFsp, request} = command.input;
        await this.publisher.publish(new ConnectorPostTransfersPublisher.Message(payerFsp, payeeFsp, request));
        return new HandlePostTransfersCommand.Output();
    }
}

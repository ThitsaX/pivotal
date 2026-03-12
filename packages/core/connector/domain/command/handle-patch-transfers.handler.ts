import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {HandlePatchTransfersCommand} from './handle-patch-transfers.command';
import {FspConnector} from '../component';

@CommandHandler(HandlePatchTransfersCommand)
export class HandlePatchTransfersHandler
    implements ICommandHandler<HandlePatchTransfersCommand, HandlePatchTransfersCommand.Output> {

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
    ) {
    }

    async execute(command: HandlePatchTransfersCommand): Promise<HandlePatchTransfersCommand.Output> {
        const {payerFsp, payeeFsp, transferId, response} = command.input;

        await this.fspConnector.patchTransfers(
            new FspConnector.PatchTransfersInput(payerFsp, payeeFsp, transferId, response),
        );

        return new HandlePatchTransfersCommand.Output();
    }
}

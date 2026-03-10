import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {HandlePatchTransfersCommand} from './handle-patch-transfers.command';
import {FspClient} from '../component';

@CommandHandler(HandlePatchTransfersCommand)
export class HandlePatchTransfersHandler
    implements ICommandHandler<HandlePatchTransfersCommand, HandlePatchTransfersCommand.Output> {

    constructor(private readonly fspClient: FspClient) {
    }

    async execute(command: HandlePatchTransfersCommand): Promise<HandlePatchTransfersCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, transferId, response} = command.input;

        await this.fspClient.patchTransfers(
            new FspClient.PatchTransfersInput(payerFsp, payeeFsp, correlationId, transferId, response),
        );

        return new HandlePatchTransfersCommand.Output();
    }
}

import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {PerformPatchTransfersCommand} from './perform-patch-transfers.command';
import {FspConnector} from '../component';

@CommandHandler(PerformPatchTransfersCommand)
export class PerformPatchTransfersHandler
    implements ICommandHandler<PerformPatchTransfersCommand, PerformPatchTransfersCommand.Output> {

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
    ) {
    }

    async execute(command: PerformPatchTransfersCommand): Promise<PerformPatchTransfersCommand.Output> {
        const {payerFsp, payeeFsp, transferId, response} = command.input;

        await this.fspConnector.patchTransfers(
            new FspConnector.PatchTransfersInput(payerFsp, payeeFsp, transferId, response),
        );

        return new PerformPatchTransfersCommand.Output();
    }
}

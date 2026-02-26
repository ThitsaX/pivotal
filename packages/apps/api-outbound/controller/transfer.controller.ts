import { Controller, Patch, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { DoTransferCommand } from '@core/outbound/domain';

@Controller('transfers')
export class TransferController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  async postTransfers(): Promise<void> {
    await this.commandBus.execute(new DoTransferCommand());
  }

  @Patch(':id')
  async patchTransfers(): Promise<void> {
    await this.commandBus.execute(new DoTransferCommand());
  }
}

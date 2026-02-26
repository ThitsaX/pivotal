import { Controller, Patch, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  HandlePatchTransfersCommand,
  HandlePostTransfersCommand,
} from '@core/inbound/domain';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  async postTransfers(): Promise<void> {
    await this.commandBus.execute(new HandlePostTransfersCommand());
  }

  @Patch(':id')
  async patchTransfers(): Promise<void> {
    await this.commandBus.execute(new HandlePatchTransfersCommand());
  }
}

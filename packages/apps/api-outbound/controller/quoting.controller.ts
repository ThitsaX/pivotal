import { Controller, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { DoQuotingCommand } from '@core/outbound/domain';

@Controller('quotes')
export class QuotingController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  async postQuotes(): Promise<void> {
    await this.commandBus.execute(new DoQuotingCommand());
  }
}

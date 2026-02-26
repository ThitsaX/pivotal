import { Controller, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { HandlePostQuotesCommand } from '@core/inbound/domain';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  async postQuotes(): Promise<void> {
    await this.commandBus.execute(new HandlePostQuotesCommand());
  }
}

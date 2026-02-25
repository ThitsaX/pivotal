import { Controller, Get } from '@nestjs/common';

@Controller()
export class ApiInboundController {
  @Get()
  getHealth(): string {
    return 'api-inbound is running';
  }
}

import { Controller, Get } from '@nestjs/common';

@Controller()
export class ApiOutboundController {
  @Get()
  getHealth(): string {
    return 'api-outbound is running';
  }
}

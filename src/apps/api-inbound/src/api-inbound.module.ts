import { Module } from '@nestjs/common';
import { ApiInboundController } from './api-inbound.controller';

@Module({
  imports: [],
  controllers: [ApiInboundController],
})
export class ApiInboundModule {}

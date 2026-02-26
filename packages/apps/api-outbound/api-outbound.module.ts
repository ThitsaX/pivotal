import { Module } from '@nestjs/common';
import { ApiOutboundController } from './api-outbound.controller';

@Module({
  imports: [],
  controllers: [ApiOutboundController],
})
export class ApiOutboundModule {}

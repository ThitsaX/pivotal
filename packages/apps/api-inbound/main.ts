import { NestFactory } from '@nestjs/core';
import { ApiInboundModule } from './api-inbound.module';

async function bootstrap() {
  const app = await NestFactory.create(ApiInboundModule);
  await app.listen(3001);
}
bootstrap();

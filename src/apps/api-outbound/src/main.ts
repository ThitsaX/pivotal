import { NestFactory } from '@nestjs/core';
import { ApiOutboundModule } from './api-outbound.module';

async function bootstrap() {
  const app = await NestFactory.create(ApiOutboundModule);
  await app.listen(3002);
}
bootstrap();

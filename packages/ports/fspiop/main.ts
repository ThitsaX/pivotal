import { NestFactory } from '@nestjs/core';
import { FspiopModule } from './fspiop.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(FspiopModule);
  const port = process.env.PORT == null ? 3000 : Number(process.env.PORT);

  await app.listen(port);
}

void bootstrap();

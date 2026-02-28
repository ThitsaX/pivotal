import { NestFactory } from '@nestjs/core';
import { Iso20022Module } from './iso20022.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(Iso20022Module);
  const port = process.env.PORT == null ? 3001 : Number(process.env.PORT);

  await app.listen(port);
}

void bootstrap();

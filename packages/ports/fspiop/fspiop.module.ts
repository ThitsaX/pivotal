import { Module } from '@nestjs/common';
import { FspiopController } from './controller/fspiop.controller';
import { FspiopUsecase } from './usecase/fspiop.usecase';

@Module({
  imports: [],
  controllers: [FspiopController],
  providers: [FspiopUsecase],
})
export class FspiopModule {}

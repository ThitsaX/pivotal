import { Module } from '@nestjs/common';
import { Iso20022Controller } from './controller/iso20022.controller';
import { Iso20022Usecase } from './usecase/iso20022.usecase';

@Module({
  imports: [],
  controllers: [Iso20022Controller],
  providers: [Iso20022Usecase],
})
export class Iso20022Module {}

import { Controller, Get } from '@nestjs/common';
import { Iso20022Usecase } from '../usecase/iso20022.usecase';

@Controller('iso20022')
export class Iso20022Controller {

  constructor(private readonly iso20022Usecase: Iso20022Usecase) {}

  @Get('health')
  health(): { status: string; context: string } {
    return this.iso20022Usecase.health();
  }
}

import { Controller, Get } from '@nestjs/common';
import { FspiopUsecase } from '../usecase/fspiop.usecase';

@Controller('fspiop')
export class FspiopController {

  constructor(private readonly fspiopUsecase: FspiopUsecase) {}

  @Get('health')
  health(): { status: string; context: string } {
    return this.fspiopUsecase.health();
  }
}

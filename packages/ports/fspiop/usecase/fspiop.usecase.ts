import { Injectable } from '@nestjs/common';

@Injectable()
export class FspiopUsecase {

  health(): { status: string; context: string } {
    return {
      status: 'ok',
      context: 'fspiop',
    };
  }
}

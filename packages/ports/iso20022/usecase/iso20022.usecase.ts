import { Injectable } from '@nestjs/common';

@Injectable()
export class Iso20022Usecase {

  health(): { status: string; context: string } {
    return {
      status: 'ok',
      context: 'iso20022',
    };
  }
}

import { QuotesIdPutResponse } from '@shared/fspiop';

export class HandlePutQuotesCommand {
  constructor(public readonly input: HandlePutQuotesCommand.Input) {}
}

export namespace HandlePutQuotesCommand {
  export class Input {
    constructor(
      public readonly id: string,
      public readonly body: QuotesIdPutResponse,
    ) {}
  }

  export class Output {}
}

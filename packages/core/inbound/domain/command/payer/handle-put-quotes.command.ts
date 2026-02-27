import { QuotesIDPutResponse } from '@shared/fspiop';

export class HandlePutQuotesCommand {
  constructor(public readonly input: HandlePutQuotesCommand.Input) {}
}

export namespace HandlePutQuotesCommand {
  export class Input {
    constructor(
      public readonly id: string,
      public readonly body: QuotesIDPutResponse,
    ) {}
  }

  export class Output {}
}

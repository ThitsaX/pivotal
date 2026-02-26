import { ErrorInformationObject } from '@shared/fspiop';

export class HandlePutQuotesErrorCommand {
  constructor(public readonly input: HandlePutQuotesErrorCommand.Input) {}
}

export namespace HandlePutQuotesErrorCommand {
  export class Input {
    constructor(
      public readonly id: string,
      public readonly body: ErrorInformationObject,
    ) {}
  }

  export class Output {}
}

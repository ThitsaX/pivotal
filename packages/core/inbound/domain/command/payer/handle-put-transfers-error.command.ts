import { ErrorInformationObject } from '@shared/fspiop';

export class HandlePutTransfersErrorCommand {
  constructor(public readonly input: HandlePutTransfersErrorCommand.Input) {}
}

export namespace HandlePutTransfersErrorCommand {
  export class Input {
    constructor(
      public readonly id: string,
      public readonly body: ErrorInformationObject,
    ) {}
  }

  export class Output {}
}

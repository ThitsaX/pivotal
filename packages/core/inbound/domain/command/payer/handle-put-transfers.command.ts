import { TransfersIdPutResponse } from '@shared/fspiop';

export class HandlePutTransfersCommand {
  constructor(public readonly input: HandlePutTransfersCommand.Input) {}
}

export namespace HandlePutTransfersCommand {
  export class Input {
    constructor(
      public readonly id: string,
      public readonly body: TransfersIdPutResponse,
    ) {}
  }

  export class Output {}
}

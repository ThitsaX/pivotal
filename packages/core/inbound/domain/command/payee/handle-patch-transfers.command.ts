import { TransfersIDPatchResponse } from '@shared/fspiop';

export class HandlePatchTransfersCommand {
  constructor(public readonly input: HandlePatchTransfersCommand.Input) {}
}

export namespace HandlePatchTransfersCommand {
  export class Input {
    constructor(
      public readonly id: string,
      public readonly body: TransfersIDPatchResponse,
    ) {}
  }

  export class Output {}
}

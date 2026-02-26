import { TransfersIdPatchResponse } from '@shared/fspiop';

export class HandlePatchTransfersCommand {
  constructor(public readonly input: HandlePatchTransfersCommand.Input) {}
}

export namespace HandlePatchTransfersCommand {
  export class Input {
    constructor(
      public readonly id: string,
      public readonly body: TransfersIdPatchResponse,
    ) {}
  }

  export class Output {}
}

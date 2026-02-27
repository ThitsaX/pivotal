import { PartiesTypeIDPutResponse, PartyIdType } from '@shared/fspiop';

export class HandlePutPartiesCommand {
  constructor(public readonly input: HandlePutPartiesCommand.Input) {}
}

export namespace HandlePutPartiesCommand {
  export class Input {
    constructor(
      public readonly type: PartyIdType,
      public readonly id: string,
      public readonly body: PartiesTypeIDPutResponse,
    ) {}
  }

  export class Output {}
}

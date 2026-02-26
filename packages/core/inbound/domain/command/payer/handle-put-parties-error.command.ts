import { ErrorInformationObject, PartyIdType } from '@shared/fspiop';

export class HandlePutPartiesErrorCommand {
  constructor(public readonly input: HandlePutPartiesErrorCommand.Input) {}
}

export namespace HandlePutPartiesErrorCommand {
  export class Input {
    constructor(
      public readonly type: PartyIdType,
      public readonly id: string,
      public readonly body: ErrorInformationObject,
    ) {}
  }

  export class Output {}
}

import { QuotesPostRequest } from '@shared/fspiop';

export class HandlePostQuotesCommand {
  constructor(public readonly input: HandlePostQuotesCommand.Input) {}
}

export namespace HandlePostQuotesCommand {
  export class Input {
    constructor(public readonly body: QuotesPostRequest) {}
  }

  export class Output {}
}

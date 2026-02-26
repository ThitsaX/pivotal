export class DoQuotingCommand {
  constructor(public readonly input: DoQuotingCommand.Input) {}
}

export namespace DoQuotingCommand {
  export class Input {}

  export class Output {}
}

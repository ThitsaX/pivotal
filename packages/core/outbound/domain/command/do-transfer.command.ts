export class DoTransferCommand {
  constructor(public readonly input: DoTransferCommand.Input) {}
}

export namespace DoTransferCommand {
  export class Input {}

  export class Output {}
}

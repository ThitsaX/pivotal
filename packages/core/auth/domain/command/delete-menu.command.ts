export class DeleteMenuCommand {

    constructor(public readonly input: DeleteMenuCommand.Input) {
    }
}

export namespace DeleteMenuCommand {

    export class Input {
        constructor(public readonly menuId: string) {
        }
    }

    export class Output {
        constructor(public readonly deleted: boolean) {
        }
    }
}

export class ReplaceMenuPermissionsCommand {

    constructor(public readonly input: ReplaceMenuPermissionsCommand.Input) {
    }
}

export namespace ReplaceMenuPermissionsCommand {

    export class Input {
        constructor(
            public readonly menuId:         string,
            public readonly permissionKeys: string[],
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly menuId:         string,
            public readonly permissionKeys: string[],
        ) {
        }
    }
}

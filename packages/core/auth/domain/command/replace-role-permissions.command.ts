export class ReplaceRolePermissionsCommand {

    constructor(public readonly input: ReplaceRolePermissionsCommand.Input) {
    }
}

export namespace ReplaceRolePermissionsCommand {

    export class Input {
        constructor(
            public readonly roleId:         string,
            public readonly permissionKeys: string[],
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly roleId:         string,
            public readonly permissionKeys: string[],
        ) {
        }
    }
}

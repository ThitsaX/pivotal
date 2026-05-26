import {Role, RoleScope} from '../model';

export class CreateRoleCommand {

    constructor(public readonly input: CreateRoleCommand.Input) {
    }
}

export namespace CreateRoleCommand {

    export class Input {
        constructor(
            public readonly code:         string,
            public readonly name:         string,
            public readonly scope:        RoleScope,
            public readonly description:  string | null,
        ) {
        }
    }

    export class Output {
        constructor(public readonly role: Role) {
        }
    }
}

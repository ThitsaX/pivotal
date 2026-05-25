import {Role} from '../model';

export class UpdateRoleCommand {

    constructor(public readonly input: UpdateRoleCommand.Input) {
    }
}

export namespace UpdateRoleCommand {

    export class Input {
        constructor(
            public readonly roleId:      string,
            public readonly name?:       string,
            public readonly description?: string | null,
        ) {
        }
    }

    export class Output {
        constructor(public readonly role: Role) {
        }
    }
}

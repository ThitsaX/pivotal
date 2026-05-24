import {Role, User} from '../model';

export class CreateUserCommand {

    constructor(public readonly input: CreateUserCommand.Input) {
    }
}

export namespace CreateUserCommand {

    export class Input {
        constructor(
            public readonly email:  string,
            public readonly roleId: string,
            public readonly fspId:  string | null,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly user:         User,
            public readonly role:         Role,
            public readonly tempPassword: string,
        ) {
        }
    }
}

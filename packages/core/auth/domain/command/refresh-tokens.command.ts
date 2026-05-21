export class RefreshTokensCommand {

    constructor(public readonly input: RefreshTokensCommand.Input) {
    }
}

export namespace RefreshTokensCommand {

    export class Input {
        constructor(public readonly refreshToken: string) {
        }
    }

    export class Output {
        constructor(
            public readonly accessToken: string,
            public readonly refreshToken: string,
            public readonly refreshTokenExpiresAt: Date,
            public readonly permissions: string[],
            public readonly mustChangePassword: boolean,
        ) {
        }
    }
}

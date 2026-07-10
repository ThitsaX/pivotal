// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class LoginCommand {

    constructor(public readonly input: LoginCommand.Input) {
    }
}

export namespace LoginCommand {

    export class Input {
        constructor(
            public readonly email: string,
            public readonly password: string,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly accessToken: string,
            public readonly refreshToken: string,
            public readonly refreshTokenExpiresAt: Date,
            public readonly user: {
                id: string;
                email: string;
                roleCode: string;
                fspId: string | null;
                mustChangePassword: boolean;
            },
            public readonly permissions: string[],
        ) {
        }
    }
}

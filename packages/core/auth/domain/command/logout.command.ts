// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export class LogoutCommand {

    constructor(public readonly input: LogoutCommand.Input) {
    }
}

export namespace LogoutCommand {

    export class Input {
        constructor(
            public readonly refreshToken: string,
            public readonly allDevices: boolean = false,
        ) {
        }
    }

    export class Output {
        constructor(public readonly revoked: boolean) {
        }
    }
}

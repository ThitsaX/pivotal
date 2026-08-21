// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { RegisterMsisdnRequest } from '../dto';

export class RegisterMsisdnCommand {

    constructor(public readonly input: RegisterMsisdnCommand.Input) {
    }
}

export namespace RegisterMsisdnCommand {

    export class Input {
        constructor(
            public readonly source: string,
            public readonly request: RegisterMsisdnRequest,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly httpStatus: number,
            public readonly body: unknown,
        ) {
        }
    }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {FspiopCurrency} from '@shared/fspiop';

export class OnboardFspCommand {
    constructor(public readonly input: OnboardFspCommand.Input) {
    }
}

export namespace OnboardFspCommand {

    export class Input {
        constructor(
            public readonly name: string,
            public readonly currencies: FspiopCurrency[],
            public readonly endpoint: string,
            public readonly jwsPublicKey: string | undefined,
            public readonly jwsPrivateKey: string | undefined,
            public readonly accessPublicKey: string,
        ) {
        }
    }

    export class Output {
        constructor(public readonly participantId: string) {
        }
    }
}

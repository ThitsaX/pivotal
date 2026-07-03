// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {FspiopCurrency} from '@shared/fspiop';

export class AddFspCurrencyCommand {
    constructor(public readonly input: AddFspCurrencyCommand.Input) {
    }
}

export namespace AddFspCurrencyCommand {

    export class Input {
        constructor(
            public readonly name: string,
            public readonly currency: FspiopCurrency,
        ) {
        }
    }

    export class Output {
        constructor(public readonly participantId: string) {
        }
    }
}

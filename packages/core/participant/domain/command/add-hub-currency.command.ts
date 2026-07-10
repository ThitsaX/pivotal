// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {FspiopCurrency} from '@shared/fspiop';

export class AddHubCurrencyCommand {
    constructor(public readonly input: AddHubCurrencyCommand.Input) {
    }
}

export namespace AddHubCurrencyCommand {

    export class Input {
        constructor(
            public readonly currency: FspiopCurrency,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly currency: FspiopCurrency,
        ) {
        }
    }
}

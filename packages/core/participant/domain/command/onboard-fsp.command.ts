// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
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
            // No JWS key fields. The signing key is provisioned by the handler into whatever
            // custody the deployment uses, so there is nothing for a caller to supply and no
            // private key on this path -- which is also the only shape that holds under the HSM
            // profile, where a key cannot be handed in at all.
            public readonly accessPublicKey: string,
        ) {
        }
    }

    export class Output {
        constructor(public readonly participantId: string) {
        }
    }
}

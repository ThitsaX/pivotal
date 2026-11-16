// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Inject, Injectable } from '@nestjs/common';
import { GovernmentPayerDisplayNameStore } from '@core/outbound/domain';
import { ParticipantSigningKeysCache } from '@core/participant/domain/component/store/participant-signing-keys-cache';

@Injectable()
export class ParticipantGovernmentPayerDisplayNameStore extends GovernmentPayerDisplayNameStore {

    constructor(
        @Inject(ParticipantSigningKeysCache)
        private readonly cache: ParticipantSigningKeysCache,
    ) {
        super();
    }

    get(fspId: string): string | undefined {
        return this.cache.getGovernmentPayerDisplayName(fspId);
    }
}

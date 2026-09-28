// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject, Injectable} from '@nestjs/common';
import {FspiopVerifyMode, JwsPolicyStore} from '@shared/fspiop';
import {ParticipantSigningKeysCache} from './participant-signing-keys-cache';

/**
 * Database-backed JWS policy, read from `participant_key` through the refresh cache.
 *
 * A source with no row falls back to the deployment default rather than being rejected. That is
 * what lets an unknown peer keep transacting while the operator decides what to do about it — the
 * decision to reject belongs to the default being set to `require`, not to the absence of a row.
 */
@Injectable()
export class ParticipantJwsPolicyStore extends JwsPolicyStore {

    constructor(
        @Inject(ParticipantSigningKeysCache)
        private readonly participantSigningKeysCache: ParticipantSigningKeysCache,
        private readonly defaultVerifyMode: FspiopVerifyMode = FspiopVerifyMode.Off,
    ) {
        super();
    }

    load(): JwsPolicyStore {
        this.participantSigningKeysCache.load();
        return this;
    }

    signEnabled(fspId: string): boolean {
        return this.participantSigningKeysCache.isSignEnabled(fspId);
    }

    verifyMode(fspId: string): FspiopVerifyMode {
        return this.participantSigningKeysCache.getVerifyMode(fspId) ?? this.defaultVerifyMode;
    }
}

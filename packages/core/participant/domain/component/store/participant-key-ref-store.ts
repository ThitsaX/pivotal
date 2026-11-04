// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject, Injectable} from '@nestjs/common';
import {KeyRefSource} from '@shared/pkcs11';
import {ParticipantSigningKeysCache} from './participant-signing-keys-cache';

/**
 * Serves key references to the device signer from the cache the registry refresh already fills.
 *
 * The mirror of `ParticipantJwsPrivateKeyStore`, and the reason the signer never touches Vault: by
 * the time a request is being signed the answer is already held, so Vault can be down and payments
 * continue.
 */
@Injectable()
export class ParticipantKeyRefStore extends KeyRefSource {

    constructor(
        @Inject(ParticipantSigningKeysCache)
        private readonly participantSigningKeysCache: ParticipantSigningKeysCache,
    ) {
        super();
    }

    keyRefFor(fspId: string): string | undefined {
        return this.participantSigningKeysCache.getKeyRef(fspId);
    }
}

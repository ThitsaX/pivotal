// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {AccessKeyStore, PublicKey} from '@shared/security';
import {ParticipantSigningKeysCache} from './participant-signing-keys-cache';
import {Inject, Injectable} from "@nestjs/common";

@Injectable()
export class ParticipantAccessKeyStore extends AccessKeyStore {

    constructor(
        @Inject(ParticipantSigningKeysCache)
        private readonly participantSigningKeysCache: ParticipantSigningKeysCache,
    ) {
        super();
    }

    load(): AccessKeyStore {
        this.participantSigningKeysCache.load();
        return this;
    }

    get(fspId: string): PublicKey | undefined {
        const publicKey = this.participantSigningKeysCache.getAccessPublicKeyPem(fspId);

        if (publicKey == null) {
            return undefined;
        }

        return PublicKey.fromBuffer(Buffer.from(publicKey, 'utf-8'));
    }
}

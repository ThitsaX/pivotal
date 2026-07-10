// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Injectable} from '@nestjs/common';
import {PublicKey, PublicKeyStore} from '@shared/security/component/key';

@Injectable()
export class FspiopJwsPublicKeyStore extends PublicKeyStore {

    private static readonly ENV_FSPIOP_JWS_PUBLIC_KEY = 'FSPIOP_JWS_PUBLIC_KEY';

    private publicKey: PublicKey | undefined;

    load(): PublicKeyStore {
        const publicKeyValue = process.env[FspiopJwsPublicKeyStore.ENV_FSPIOP_JWS_PUBLIC_KEY];

        if (publicKeyValue == null || publicKeyValue.trim().length === 0) {
            this.publicKey = undefined;
            return this;
        }

        const normalizedPem = publicKeyValue.replace(/\\n/g, '\n');
        this.publicKey = PublicKey.fromBuffer(Buffer.from(normalizedPem, 'utf-8'));

        return this;
    }

    get(fspId: string): PublicKey | undefined {
        void fspId;
        return this.publicKey;
    }
}

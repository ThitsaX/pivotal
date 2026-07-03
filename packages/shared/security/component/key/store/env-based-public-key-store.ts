// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {PublicKey} from '../public-key';
import {PublicKeyStore} from '../public-key-store';

export class EnvBasedPublicKeyStore extends PublicKeyStore {

    private static readonly FSP_IDS_ENV_NAME = 'FSPIOP_FSP_IDS';

    private static readonly PUBLIC_KEY_ENV_PREFIX = 'FSPIOP_JWS_PUBLIC_KEY_';

    private readonly publicKeysByFspId = new Map<string, PublicKey>();

    load(): PublicKeyStore {
        const fspIdsValue = process.env[EnvBasedPublicKeyStore.FSP_IDS_ENV_NAME];

        if (fspIdsValue == null || fspIdsValue.trim().length === 0) {
            return this;
        }

        const fspIds = fspIdsValue
            .split(',')
            .map((fspId) => fspId.trim())
            .filter((fspId) => fspId.length > 0);

        for (const fspId of fspIds) {
            const publicKeyEnvName = EnvBasedPublicKeyStore.resolvePublicKeyEnvName(fspId);
            const publicKeyValue = process.env[publicKeyEnvName];

            if (publicKeyValue == null || publicKeyValue.trim().length === 0) {
                throw new Error(`Missing public key for '${fspId}'. Expected env var '${publicKeyEnvName}'.`);
            }

            const normalizedPem = publicKeyValue.replace(/\\n/g, '\n');
            const publicKey = PublicKey.fromBuffer(Buffer.from(normalizedPem, 'utf-8'));

            this.put(fspId, publicKey);
        }

        return this;
    }

    get(fspId: string): PublicKey | undefined {
        const publicKey = this.publicKeysByFspId.get(fspId);

        if (publicKey == null) {
            return undefined;
        }

        return PublicKey.fromBuffer(publicKey.toBuffer());
    }

    private put(fspId: string, publicKey: PublicKey): void {
        this.publicKeysByFspId.set(fspId, PublicKey.fromBuffer(publicKey.toBuffer()));
    }

    private static resolvePublicKeyEnvName(fspId: string): string {
        const normalizedFspId = fspId.trim().toUpperCase();

        return `${EnvBasedPublicKeyStore.PUBLIC_KEY_ENV_PREFIX}${normalizedFspId}`;
    }
}

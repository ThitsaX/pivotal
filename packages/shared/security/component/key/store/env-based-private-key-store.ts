// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {PrivateKey} from '../private-key';
import {PrivateKeyStore} from '../private-key-store';

export class EnvBasedPrivateKeyStore extends PrivateKeyStore {

    private static readonly FSP_IDS_ENV_NAME = 'FSPIOP_FSP_IDS';

    private static readonly PRIVATE_KEY_ENV_PREFIX = 'FSPIOP_JWS_PRIVATE_KEY_';

    private readonly privateKeysByFspId = new Map<string, PrivateKey>();

    load(): PrivateKeyStore {
        const fspIdsValue = process.env[EnvBasedPrivateKeyStore.FSP_IDS_ENV_NAME];

        if (fspIdsValue == null || fspIdsValue.trim().length === 0) {
            return this;
        }

        const fspIds = fspIdsValue
            .split(',')
            .map((fspId) => fspId.trim())
            .filter((fspId) => fspId.length > 0);

        for (const fspId of fspIds) {
            const privateKeyEnvName = EnvBasedPrivateKeyStore.resolvePrivateKeyEnvName(fspId);
            const privateKeyValue = process.env[privateKeyEnvName];

            if (privateKeyValue == null || privateKeyValue.trim().length === 0) {
                throw new Error(`Missing private key for '${fspId}'. Expected env var '${privateKeyEnvName}'.`);
            }

            const normalizedPem = privateKeyValue.replace(/\\n/g, '\n');
            const privateKey = PrivateKey.fromBuffer(Buffer.from(normalizedPem, 'utf-8'));

            this.put(fspId, privateKey);
        }

        return this;
    }

    get(fspId: string): PrivateKey | undefined {
        const privateKey = this.privateKeysByFspId.get(fspId);

        if (privateKey == null) {
            return undefined;
        }

        return PrivateKey.fromBuffer(privateKey.toBuffer());
    }

    private put(fspId: string, privateKey: PrivateKey): void {
        this.privateKeysByFspId.set(fspId, PrivateKey.fromBuffer(privateKey.toBuffer()));
    }

    private static resolvePrivateKeyEnvName(fspId: string): string {
        const normalizedFspId = fspId.trim().toUpperCase();

        return `${EnvBasedPrivateKeyStore.PRIVATE_KEY_ENV_PREFIX}${normalizedFspId}`;
    }
}

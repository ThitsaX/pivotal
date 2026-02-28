import {Injectable} from '@nestjs/common';
import {PublicKey} from '../public-key';
import {PublicKeyLoader} from '../public-key-loader';

@Injectable()
export class EnvBasedPublicKeyLoader extends PublicKeyLoader {

    private static readonly FSP_IDS_ENV_NAME = 'FSP_IDS';

    private static readonly PUBLIC_KEY_ENV_PREFIX = 'PUBLIC_KEY_';

    load(): Map<string, PublicKey> {
        const keysByFspId = new Map<string, PublicKey>();
        const fspIdsValue = process.env[EnvBasedPublicKeyLoader.FSP_IDS_ENV_NAME];

        if (fspIdsValue == null || fspIdsValue.trim().length === 0) {
            return keysByFspId;
        }

        const fspIds = fspIdsValue
            .split(',')
            .map((fspId) => fspId.trim())
            .filter((fspId) => fspId.length > 0);

        for (const fspId of fspIds) {
            const publicKeyEnvName = EnvBasedPublicKeyLoader.resolvePublicKeyEnvName(fspId);
            const publicKeyValue = process.env[publicKeyEnvName];

            if (publicKeyValue == null || publicKeyValue.trim().length === 0) {
                throw new Error(`Missing public key for '${fspId}'. Expected env var '${publicKeyEnvName}'.`);
            }

            const normalizedPem = publicKeyValue.replace(/\\n/g, '\n');

            keysByFspId.set(fspId, PublicKey.fromBuffer(Buffer.from(normalizedPem, 'utf-8')));
        }

        return keysByFspId;
    }

    private static resolvePublicKeyEnvName(fspId: string): string {
        const normalizedFspId = fspId.trim().toUpperCase();

        return `${EnvBasedPublicKeyLoader.PUBLIC_KEY_ENV_PREFIX}${normalizedFspId}`;
    }
}

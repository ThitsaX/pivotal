import {Injectable} from '@nestjs/common';
import {PrivateKey} from '../private-key';
import {PrivateKeyLoader} from '../private-key-loader';

@Injectable()
export class EnvBasedPrivateKeyLoader extends PrivateKeyLoader {

    private static readonly FSP_IDS_ENV_NAME = 'FSP_IDS';

    private static readonly PRIVATE_KEY_ENV_PREFIX = 'PRIVATE_KEY_';

    load(): Map<string, PrivateKey> {
        const keysByFspId = new Map<string, PrivateKey>();
        const fspIdsValue = process.env[EnvBasedPrivateKeyLoader.FSP_IDS_ENV_NAME];

        if (fspIdsValue == null || fspIdsValue.trim().length === 0) {
            return keysByFspId;
        }

        const fspIds = fspIdsValue
            .split(',')
            .map((fspId) => fspId.trim())
            .filter((fspId) => fspId.length > 0);

        for (const fspId of fspIds) {
            const privateKeyEnvName = EnvBasedPrivateKeyLoader.resolvePrivateKeyEnvName(fspId);
            const privateKeyValue = process.env[privateKeyEnvName];

            if (privateKeyValue == null || privateKeyValue.trim().length === 0) {
                throw new Error(`Missing private key for '${fspId}'. Expected env var '${privateKeyEnvName}'.`);
            }

            const normalizedPem = privateKeyValue.replace(/\\n/g, '\n');

            keysByFspId.set(fspId, PrivateKey.fromBuffer(Buffer.from(normalizedPem, 'utf-8')));
        }

        return keysByFspId;
    }

    private static resolvePrivateKeyEnvName(fspId: string): string {
        const normalizedFspId = fspId.trim().toUpperCase();

        return `${EnvBasedPrivateKeyLoader.PRIVATE_KEY_ENV_PREFIX}${normalizedFspId}`;
    }
}

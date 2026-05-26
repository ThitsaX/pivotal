import {AccessKeyStore} from '../access-key-store';
import {PublicKey} from '../public-key';

export class EnvBasedAccessKeyStore extends AccessKeyStore {

    private static readonly FSP_IDS_ENV_NAME = 'FSPIOP_FSP_IDS';

    private static readonly ACCESS_KEY_ENV_PREFIX = 'FSPIOP_ACCESS_PUBLIC_KEY_';

    private readonly accessKeysByFspId = new Map<string, PublicKey>();

    load(): AccessKeyStore {
        const fspIdsValue = process.env[EnvBasedAccessKeyStore.FSP_IDS_ENV_NAME];

        if (fspIdsValue == null || fspIdsValue.trim().length === 0) {
            return this;
        }

        const fspIds = fspIdsValue
            .split(',')
            .map((fspId) => fspId.trim())
            .filter((fspId) => fspId.length > 0);

        for (const fspId of fspIds) {
            const accessKeyEnvName = EnvBasedAccessKeyStore.resolveAccessKeyEnvName(fspId);
            const accessKeyValue = process.env[accessKeyEnvName];

            if (accessKeyValue == null || accessKeyValue.trim().length === 0) {
                throw new Error(`Missing access key for '${fspId}'. Expected env var '${accessKeyEnvName}'.`);
            }

            const normalizedPem = accessKeyValue.replace(/\\n/g, '\n');
            const accessKey = PublicKey.fromBuffer(Buffer.from(normalizedPem, 'utf-8'));

            this.put(fspId, accessKey);
        }

        return this;
    }

    get(fspId: string): PublicKey | undefined {
        const accessKey = this.accessKeysByFspId.get(fspId);

        if (accessKey == null) {
            return undefined;
        }

        return PublicKey.fromBuffer(accessKey.toBuffer());
    }

    private put(fspId: string, accessKey: PublicKey): void {
        this.accessKeysByFspId.set(fspId, PublicKey.fromBuffer(accessKey.toBuffer()));
    }

    private static resolveAccessKeyEnvName(fspId: string): string {
        const normalizedFspId = fspId.trim().toUpperCase();

        return `${EnvBasedAccessKeyStore.ACCESS_KEY_ENV_PREFIX}${normalizedFspId}`;
    }
}

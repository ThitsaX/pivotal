import {PrivateKey} from '../private-key';
import {PrivateKeyStore} from '../private-key-store';

export class JsonBasedPrivateKeyStore extends PrivateKeyStore {

    private static readonly ENV_JSON_PRIVATE_KEYS = 'JSON_PRIVATE_KEYS';

    private readonly privateKeysByFspId = new Map<string, PrivateKey>();

    load(): PrivateKeyStore {
        const raw = process.env[JsonBasedPrivateKeyStore.ENV_JSON_PRIVATE_KEYS];
        const sourceObject = this.resolveSourceObject(raw);

        for (const [fspId, privateKeyValue] of Object.entries(sourceObject)) {
            const normalizedFspId = fspId.trim();

            if (normalizedFspId.length === 0) {
                continue;
            }

            if (typeof privateKeyValue !== 'string' || privateKeyValue.trim().length === 0) {
                throw new Error(`Private key for '${normalizedFspId}' must be a non-empty string.`);
            }

            const normalizedPem = privateKeyValue.replace(/\\n/g, '\n');
            const privateKey = PrivateKey.fromBuffer(Buffer.from(normalizedPem, 'utf-8'));

            this.put(normalizedFspId, privateKey);
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

    private resolveSourceObject(source: string | null | undefined): Record<string, unknown> {
        if (source == null || source.trim().length === 0) {
            return {};
        }

        const parsed = JSON.parse(source) as unknown;

        if (parsed == null || Array.isArray(parsed) || typeof parsed !== 'object') {
            throw new Error('JSON_PRIVATE_KEYS must be a JSON object.');
        }

        return parsed as Record<string, unknown>;
    }
}

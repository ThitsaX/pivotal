import {PublicKey} from '../public-key';
import {PublicKeyStore} from '../public-key-store';

export class JsonBasedPublicKeyStore extends PublicKeyStore {

    private static readonly ENV_JSON_PUBLIC_KEYS = 'JSON_PUBLIC_KEYS';

    private readonly publicKeysByFspId = new Map<string, PublicKey>();

    load(): PublicKeyStore {
        const raw = process.env[JsonBasedPublicKeyStore.ENV_JSON_PUBLIC_KEYS];
        const sourceObject = this.resolveSourceObject(raw);

        for (const [fspId, publicKeyValue] of Object.entries(sourceObject)) {
            const normalizedFspId = fspId.trim();

            if (normalizedFspId.length === 0) {
                continue;
            }

            if (typeof publicKeyValue !== 'string' || publicKeyValue.trim().length === 0) {
                throw new Error(`Public key for '${normalizedFspId}' must be a non-empty string.`);
            }

            const normalizedPem = publicKeyValue.replace(/\\n/g, '\n');
            const publicKey = PublicKey.fromBuffer(Buffer.from(normalizedPem, 'utf-8'));

            this.put(normalizedFspId, publicKey);
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

    private resolveSourceObject(source: string | null | undefined): Record<string, unknown> {
        if (source == null || source.trim().length === 0) {
            return {};
        }

        const parsed = JSON.parse(source) as unknown;

        if (parsed == null || Array.isArray(parsed) || typeof parsed !== 'object') {
            throw new Error('JSON_PUBLIC_KEYS must be a JSON object.');
        }

        return parsed as Record<string, unknown>;
    }
}

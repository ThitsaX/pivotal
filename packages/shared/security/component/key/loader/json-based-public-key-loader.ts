import {Injectable} from '@nestjs/common';
import {PublicKey} from '../public-key';
import {PublicKeyLoader} from '../public-key-loader';

@Injectable()
export class JsonBasedPublicKeyLoader extends PublicKeyLoader {

    private static readonly ENV_JSON_PUBLIC_KEYS = 'JSON_PUBLIC_KEYS';

    load(): Map<string, PublicKey> {
        const keysByFspId = new Map<string, PublicKey>();
        const raw = process.env[JsonBasedPublicKeyLoader.ENV_JSON_PUBLIC_KEYS];
        const sourceObject = this.resolveSourceObject(raw);

        for (const [fspId, publicKeyValue] of Object.entries(sourceObject)) {
            const normalizedFspId = fspId.trim();

            if (normalizedFspId.length === 0) {
                continue;
            }

            if (publicKeyValue == null || publicKeyValue.trim().length === 0) {
                throw new Error(`Public key for '${normalizedFspId}' must be a non-empty string.`);
            }

            const normalizedPem = publicKeyValue.replace(/\\n/g, '\n');

            keysByFspId.set(normalizedFspId, PublicKey.fromBuffer(Buffer.from(normalizedPem, 'utf-8')));
        }

        return keysByFspId;
    }

    private resolveSourceObject(source: string | null | undefined): Record<string, string> {
        if (source == null || source.trim().length === 0) {
            return {};
        }

        const parsed = JSON.parse(source) as unknown;

        if (parsed == null || Array.isArray(parsed) || typeof parsed !== 'object') {
            throw new Error('JSON_PUBLIC_KEYS must be a JSON object.');
        }

        return parsed as Record<string, string>;
    }
}

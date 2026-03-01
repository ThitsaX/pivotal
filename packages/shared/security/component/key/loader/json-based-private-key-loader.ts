import {Injectable} from '@nestjs/common';
import {PrivateKey} from '../private-key';
import {PrivateKeyLoader} from '../private-key-loader';

@Injectable()
export class JsonBasedPrivateKeyLoader extends PrivateKeyLoader {

    private static readonly ENV_JSON_PRIVATE_KEYS = 'JSON_PRIVATE_KEYS';

    load(): Map<string, PrivateKey> {
        const keysByFspId = new Map<string, PrivateKey>();
        const raw = process.env[JsonBasedPrivateKeyLoader.ENV_JSON_PRIVATE_KEYS];
        const sourceObject = this.resolveSourceObject(raw);

        for (const [fspId, privateKeyValue] of Object.entries(sourceObject)) {
            const normalizedFspId = fspId.trim();

            if (normalizedFspId.length === 0) {
                continue;
            }

            if (privateKeyValue == null || privateKeyValue.trim().length === 0) {
                throw new Error(`Private key for '${normalizedFspId}' must be a non-empty string.`);
            }

            const normalizedPem = privateKeyValue.replace(/\\n/g, '\n');

            keysByFspId.set(normalizedFspId, PrivateKey.fromBuffer(Buffer.from(normalizedPem, 'utf-8')));
        }

        return keysByFspId;
    }

    private resolveSourceObject(source: string | null | undefined): Record<string, string> {
        if (source == null || source.trim().length === 0) {
            return {};
        }

        const parsed = JSON.parse(source) as unknown;

        if (parsed == null || Array.isArray(parsed) || typeof parsed !== 'object') {
            throw new Error('JSON_PRIVATE_KEYS must be a JSON object.');
        }

        return parsed as Record<string, string>;
    }
}

import {Injectable, Optional} from '@nestjs/common';
import {PrivateKey} from '../private-key';
import {PrivateKeyLoader} from '../private-key-loader';

type JsonPrivateKeySource = Record<string, string> | string | null | undefined;

@Injectable()
export class JsonBasedPrivateKeyLoader extends PrivateKeyLoader {

    private readonly source: JsonPrivateKeySource;

    constructor(source: JsonPrivateKeySource) {
        super();
        this.source = source;
    }

    static fromObject(source: Record<string, string>): JsonBasedPrivateKeyLoader {
        return new JsonBasedPrivateKeyLoader(source);
    }

    static fromJson(source: string): JsonBasedPrivateKeyLoader {
        return new JsonBasedPrivateKeyLoader(source);
    }

    load(): Map<string, PrivateKey> {
        const keysByFspId = new Map<string, PrivateKey>();
        const sourceObject = this.resolveSourceObject(this.source);

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

    private resolveSourceObject(source: JsonPrivateKeySource): Record<string, string> {
        if (source == null) {
            return {};
        }

        if (typeof source === 'string') {
            const parsed = JSON.parse(source) as unknown;

            if (parsed == null || Array.isArray(parsed) || typeof parsed !== 'object') {
                throw new Error('JSON private key source must be an object.');
            }

            return parsed as Record<string, string>;
        }

        return source;
    }
}

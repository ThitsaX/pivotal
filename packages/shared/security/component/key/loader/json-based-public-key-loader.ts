import { Injectable, Optional } from '@nestjs/common';
import { PublicKey } from '../public-key';
import { PublicKeyLoader } from '../public-key-loader';

type JsonPublicKeySource = Record<string, string> | string | null | undefined;

@Injectable()
export class JsonBasedPublicKeyLoader extends PublicKeyLoader {

    private readonly source: JsonPublicKeySource;

    constructor(source: JsonPublicKeySource) {
        super();
        this.source = source;
    }

    static fromObject(source: Record<string, string>): JsonBasedPublicKeyLoader {
        return new JsonBasedPublicKeyLoader(source);
    }

    static fromJson(source: string): JsonBasedPublicKeyLoader {
        return new JsonBasedPublicKeyLoader(source);
    }

    load(): Map<string, PublicKey> {
        const keysByFspId = new Map<string, PublicKey>();
        const sourceObject = this.resolveSourceObject(this.source);

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

    private resolveSourceObject(source: JsonPublicKeySource): Record<string, string> {
        if (source == null) {
            return {};
        }

        if (typeof source === 'string') {
            const parsed = JSON.parse(source) as unknown;

            if (parsed == null || Array.isArray(parsed) || typeof parsed !== 'object') {
                throw new Error('JSON public key source must be an object.');
            }

            return parsed as Record<string, string>;
        }

        return source;
    }
}

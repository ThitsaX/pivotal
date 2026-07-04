// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {AccessKeyStore} from '../access-key-store';
import {PublicKey} from '../public-key';

export class JsonBasedAccessKeyStore extends AccessKeyStore {

    private static readonly ENV_JSON_ACCESS_KEYS = 'JSON_ACCESS_KEYS';

    private readonly accessKeysByFspId = new Map<string, PublicKey>();

    load(): AccessKeyStore {
        const raw = process.env[JsonBasedAccessKeyStore.ENV_JSON_ACCESS_KEYS];
        const sourceObject = this.resolveSourceObject(raw);

        for (const [fspId, accessKeyValue] of Object.entries(sourceObject)) {
            const normalizedFspId = fspId.trim();

            if (normalizedFspId.length === 0) {
                continue;
            }

            if (typeof accessKeyValue !== 'string' || accessKeyValue.trim().length === 0) {
                throw new Error(`Access key for '${normalizedFspId}' must be a non-empty string.`);
            }

            const normalizedPem = accessKeyValue.replace(/\\n/g, '\n');
            const accessKey = PublicKey.fromBuffer(Buffer.from(normalizedPem, 'utf-8'));

            this.put(normalizedFspId, accessKey);
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

    private resolveSourceObject(source: string | null | undefined): Record<string, unknown> {
        if (source == null || source.trim().length === 0) {
            return {};
        }

        const parsed = JSON.parse(source) as unknown;

        if (parsed == null || Array.isArray(parsed) || typeof parsed !== 'object') {
            throw new Error('JSON_ACCESS_KEYS must be a JSON object.');
        }

        return parsed as Record<string, unknown>;
    }
}

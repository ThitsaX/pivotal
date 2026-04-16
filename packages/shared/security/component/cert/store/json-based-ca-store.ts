import {Ca} from '../ca';
import {CaCert} from '../ca-cert';
import {CaStore} from '../ca-store';

export class JsonBasedCaStore extends CaStore {

    private static readonly ENV_JSON_CA_CERTS = 'JSON_CA_CERTS';

    private combined: Ca | undefined;

    load(): CaStore {
        const raw = process.env[JsonBasedCaStore.ENV_JSON_CA_CERTS];
        const sourceArray = this.resolveSourceArray(raw);
        const certs = sourceArray.map((entry, index) => {
            if (typeof entry !== 'string' || entry.trim().length === 0) {
                throw new Error(`CA certificate at index ${index} must be a non-empty string.`);
            }

            const normalizedPem = entry.replace(/\\n/g, '\n');
            return CaCert.fromBuffer(Buffer.from(normalizedPem, 'utf-8'));
        });

        if (certs.length === 0) {
            return this;
        }

        const incoming = Buffer.concat(certs.map((c) => c.toBuffer()));
        this.combined = this.combined == null
            ? Ca.fromBuffer(incoming)
            : Ca.fromBuffer(Buffer.concat([this.combined.toBuffer(), incoming]));

        return this;
    }

    get(): Ca | undefined {
        return this.combined;
    }

    private resolveSourceArray(source: string | null | undefined): unknown[] {
        if (source == null || source.trim().length === 0) {
            return [];
        }

        const parsed = JSON.parse(source) as unknown;

        if (!Array.isArray(parsed)) {
            throw new Error('JSON_CA_CERTS must be a JSON array, e.g. ["CA1_PEM", "CA2_PEM"].');
        }

        return parsed as unknown[];
    }
}

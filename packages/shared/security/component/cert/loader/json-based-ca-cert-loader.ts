import {Injectable} from '@nestjs/common';
import {CaCert} from '../ca-cert';
import {CaCertLoader} from '../ca-cert-loader';

@Injectable()
export class JsonBasedCaCertLoader extends CaCertLoader {

    private static readonly ENV_JSON_CA_CERTS = 'JSON_CA_CERTS';

    load(): CaCert[] {
        const raw = process.env[JsonBasedCaCertLoader.ENV_JSON_CA_CERTS];
        const sourceArray = this.resolveSourceArray(raw);

        return sourceArray.map((entry, index) => {
            if (entry == null || entry.trim().length === 0) {
                throw new Error(`CA certificate at index ${index} must be a non-empty string.`);
            }

            const normalizedPem = entry.replace(/\\n/g, '\n');
            return CaCert.fromBuffer(Buffer.from(normalizedPem, 'utf-8'));
        });
    }

    private resolveSourceArray(source: string | null | undefined): string[] {
        if (source == null || source.trim().length === 0) {
            return [];
        }

        const parsed = JSON.parse(source) as unknown;

        if (!Array.isArray(parsed)) {
            throw new Error('JSON_CA_CERTS must be a JSON array, e.g. ["CA1_PEM", "CA2_PEM"].');
        }

        return parsed as string[];
    }
}

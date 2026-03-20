import {Injectable} from '@nestjs/common';
import {ClientCert} from '../client-cert';
import {ClientCertStore} from '../client-cert-store';

interface JsonClientCertSource {
    clientCert: string;

    clientKey:  string;
}

@Injectable()
export class JsonBasedClientCertStore extends ClientCertStore {

    private static readonly ENV_JSON_CLIENT_CERT = 'JSON_CLIENT_CERT';

    private clientCert: ClientCert | undefined;

    load(): ClientCertStore {
        const raw = process.env[JsonBasedClientCertStore.ENV_JSON_CLIENT_CERT];

        if (raw == null || raw.trim().length === 0) {
            this.clientCert = undefined;
            return this;
        }

        const parsed = JSON.parse(raw) as unknown;

        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('JSON_CLIENT_CERT must be a JSON object with "clientCert" and "clientKey" fields.');
        }

        const source = parsed as Partial<JsonClientCertSource>;

        if (!source.clientCert || source.clientCert.trim().length === 0) {
            throw new Error('JSON_CLIENT_CERT is missing the "clientCert" field.');
        }

        if (!source.clientKey || source.clientKey.trim().length === 0) {
            throw new Error('JSON_CLIENT_CERT is missing the "clientKey" field.');
        }

        const cert = Buffer.from(source.clientCert.replace(/\\n/g, '\n'), 'utf-8');
        const key  = Buffer.from(source.clientKey.replace(/\\n/g, '\n'),  'utf-8');

        this.clientCert = ClientCert.fromBuffers(cert, key);

        return this;
    }

    get(): ClientCert | undefined {
        return this.clientCert;
    }
}

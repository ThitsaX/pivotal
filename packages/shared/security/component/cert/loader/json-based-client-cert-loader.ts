import {Injectable} from '@nestjs/common';
import {ClientCert} from '../client-cert';
import {ClientCertLoader} from '../client-cert-loader';

interface JsonClientCertSource {
    clientCert: string;
    clientKey:  string;
}

/**
 * Loads the client certificate and key from a JSON environment variable.
 *
 * Expected env variable:
 *   JSON_CLIENT_CERT — JSON object with 'clientCert' and 'clientKey' PEM fields.
 *
 * Example:
 *   JSON_CLIENT_CERT={"clientCert":"-----BEGIN CERTIFICATE-----\n...", "clientKey":"-----BEGIN RSA PRIVATE KEY-----\n..."}
 *
 * If the variable is absent, load() returns undefined.
 * Embedded newlines may be escaped as \n.
 */
@Injectable()
export class JsonBasedClientCertLoader extends ClientCertLoader {

    private static readonly ENV_JSON_CLIENT_CERT = 'JSON_CLIENT_CERT';

    load(): ClientCert | undefined {
        const raw = process.env[JsonBasedClientCertLoader.ENV_JSON_CLIENT_CERT];

        if (raw == null || raw.trim().length === 0) {
            return undefined;
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

        return ClientCert.fromBuffers(cert, key);
    }
}

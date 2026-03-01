import {Injectable} from '@nestjs/common';
import {ClientCert} from '../client-cert';
import {ClientCertLoader} from '../client-cert-loader';

/**
 * Loads the client certificate and key from environment variables.
 *
 * Expected env variables:
 *   CLIENT_CERT_CONTENT — PEM content of the client certificate
 *   CLIENT_CERT_KEY     — PEM content of the client private key
 *
 * Both must be set together. If neither is set, load() returns undefined
 * (no mTLS client cert configured). If only one is set, an error is thrown.
 * Embedded newlines may be escaped as \n.
 */
@Injectable()
export class EnvBasedClientCertLoader extends ClientCertLoader {

    private static readonly ENV_CLIENT_CERT_CONTENT = 'CLIENT_CERT_CONTENT';
    private static readonly ENV_CLIENT_CERT_KEY      = 'CLIENT_CERT_KEY';

    load(): ClientCert | undefined {
        const certContent = process.env[EnvBasedClientCertLoader.ENV_CLIENT_CERT_CONTENT];
        const keyContent  = process.env[EnvBasedClientCertLoader.ENV_CLIENT_CERT_KEY];

        const hasCert = certContent != null && certContent.trim().length > 0;
        const hasKey  = keyContent  != null && keyContent.trim().length  > 0;

        if (!hasCert && !hasKey) {
            return undefined;
        }

        if (!hasCert) {
            throw new Error(
                `CLIENT_CERT_CONTENT is missing. ` +
                `Both CLIENT_CERT_CONTENT and CLIENT_CERT_KEY must be set together.`,
            );
        }

        if (!hasKey) {
            throw new Error(
                `CLIENT_CERT_KEY is missing. ` +
                `Both CLIENT_CERT_CONTENT and CLIENT_CERT_KEY must be set together.`,
            );
        }

        const cert = Buffer.from(certContent!.replace(/\\n/g, '\n'), 'utf-8');
        const key  = Buffer.from(keyContent!.replace(/\\n/g, '\n'),  'utf-8');

        return ClientCert.fromBuffers(cert, key);
    }
}

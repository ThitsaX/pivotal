import {Injectable} from '@nestjs/common';
import {CaCert} from '../ca-cert';
import {CaCertLoader} from '../ca-cert-loader';

/**
 * Loads CA certificates from environment variables.
 *
 * Expected env variables:
 *   FSPIOP_MTLS_CA_COUNT         — total number of CA certificates (integer)
 *   FSPIOP_MTLS_CA_CONTENT_1     — PEM content of the 1st CA cert
 *   FSPIOP_MTLS_CA_CONTENT_2     — PEM content of the 2nd CA cert
 *   FSPIOP_MTLS_CA_CONTENT_N     — PEM content of the Nth CA cert
 *
 * All certs are returned as individual CaCert instances.
 * CaStore.load() concatenates them into a single PEM bundle.
 *
 * Embedded newlines can be escaped as \n (e.g. when stored in .env files).
 * They are normalised before parsing.
 */
@Injectable()
export class EnvBasedCaCertLoader extends CaCertLoader {

    private static readonly ENV_CA_COUNT   = 'FSPIOP_MTLS_CA_COUNT';
    private static readonly ENV_CA_CONTENT = 'FSPIOP_MTLS_CA_CONTENT_';

    load(): CaCert[] {
        const countStr = process.env[EnvBasedCaCertLoader.ENV_CA_COUNT];

        if (countStr == null || countStr.trim().length === 0) {
            return [];
        }

        const count = parseInt(countStr.trim(), 10);

        if (isNaN(count) || count <= 0) {
            return [];
        }

        const certs: CaCert[] = [];

        for (let i = 1; i <= count; i++) {
            const envName = `${EnvBasedCaCertLoader.ENV_CA_CONTENT}${i}`;
            const content = process.env[envName];

            if (content == null || content.trim().length === 0) {
                throw new Error(
                    `Missing CA certificate at '${envName}'. ` +
                    `FSPIOP_MTLS_CA_COUNT is ${count} but no content was found for index ${i}.`,
                );
            }

            const normalizedPem = content.replace(/\\n/g, '\n');
            certs.push(CaCert.fromBuffer(Buffer.from(normalizedPem, 'utf-8')));
        }

        return certs;
    }
}

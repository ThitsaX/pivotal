// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ClientCert} from '../client-cert';
import {ClientCertStore} from '../client-cert-store';

export class EnvBasedClientCertStore extends ClientCertStore {

    private static readonly ENV_CLIENT_CERT_CONTENT = 'CLIENT_CERT_CONTENT';

    private static readonly ENV_CLIENT_CERT_KEY      = 'CLIENT_CERT_KEY';

    private clientCert: ClientCert | undefined;

    load(): ClientCertStore {
        const certContent = process.env[EnvBasedClientCertStore.ENV_CLIENT_CERT_CONTENT];
        const keyContent  = process.env[EnvBasedClientCertStore.ENV_CLIENT_CERT_KEY];

        const hasCert = certContent != null && certContent.trim().length > 0;
        const hasKey  = keyContent  != null && keyContent.trim().length  > 0;

        if (!hasCert && !hasKey) {
            this.clientCert = undefined;
            return this;
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

        this.clientCert = ClientCert.fromBuffers(cert, key);

        return this;
    }

    get(): ClientCert | undefined {
        return this.clientCert;
    }
}

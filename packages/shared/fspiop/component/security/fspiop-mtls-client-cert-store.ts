// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Injectable} from '@nestjs/common';
import {ClientCert, ClientCertStore} from '@shared/security/component/cert';

@Injectable()
export class FspiopMtlsClientCertStore extends ClientCertStore {

    private static readonly ENV_FSPIOP_MTLS_CLIENT_CERT = 'FSPIOP_MTLS_CLIENT_CERT';

    private static readonly ENV_FSPIOP_MTLS_CLIENT_KEY = 'FSPIOP_MTLS_CLIENT_KEY';

    private clientCert: ClientCert | undefined;

    load(): ClientCertStore {
        const certContent = process.env[FspiopMtlsClientCertStore.ENV_FSPIOP_MTLS_CLIENT_CERT];
        const keyContent = process.env[FspiopMtlsClientCertStore.ENV_FSPIOP_MTLS_CLIENT_KEY];
        const hasCert = certContent != null && certContent.trim().length > 0;
        const hasKey = keyContent != null && keyContent.trim().length > 0;

        if (!hasCert && !hasKey) {
            this.clientCert = undefined;
            return this;
        }

        if (!hasCert) {
            throw new Error(
                `FSPIOP_MTLS_CLIENT_CERT is missing. ` +
                `Both FSPIOP_MTLS_CLIENT_CERT and FSPIOP_MTLS_CLIENT_KEY must be set together.`,
            );
        }

        if (!hasKey) {
            throw new Error(
                `FSPIOP_MTLS_CLIENT_KEY is missing. ` +
                `Both FSPIOP_MTLS_CLIENT_CERT and FSPIOP_MTLS_CLIENT_KEY must be set together.`,
            );
        }

        const cert = Buffer.from(certContent!.replace(/\\n/g, '\n'), 'utf-8');
        const key = Buffer.from(keyContent!.replace(/\\n/g, '\n'), 'utf-8');

        this.clientCert = ClientCert.fromBuffers(cert, key);

        return this;
    }

    get(): ClientCert | undefined {
        return this.clientCert;
    }
}

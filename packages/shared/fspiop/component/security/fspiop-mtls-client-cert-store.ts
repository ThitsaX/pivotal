// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as fs from 'node:fs';
import {Injectable} from '@nestjs/common';
import {ClientCert, ClientCertStore} from '@shared/security/component/cert';

/**
 * The certificate and private key this service presents to prove who it is.
 *
 * Files take precedence over inline values. A deployment mounts a Secret that
 * cert-manager renews on its own cadence, so the material has to be read from disk
 * rather than baked into the Deployment; the inline form remains for local runs.
 *
 * Certificate and key are always required together. Half a pair is a
 * misconfiguration that would otherwise surface as an opaque handshake failure.
 */
@Injectable()
export class FspiopMtlsClientCertStore extends ClientCertStore {

    private static readonly ENV_CERT = 'FSPIOP_MTLS_CLIENT_CERT';
    private static readonly ENV_KEY = 'FSPIOP_MTLS_CLIENT_KEY';
    private static readonly ENV_CERT_PATH = 'FSPIOP_MTLS_CLIENT_CERT_PATH';
    private static readonly ENV_KEY_PATH = 'FSPIOP_MTLS_CLIENT_KEY_PATH';

    private clientCert: ClientCert | undefined;

    load(): ClientCertStore {
        const pair = FspiopMtlsClientCertStore.readPem();

        this.clientCert = pair == null
            ? undefined
            : ClientCert.fromBuffers(Buffer.from(pair.cert, 'utf-8'), Buffer.from(pair.key, 'utf-8'));

        return this;
    }

    get(): ClientCert | undefined {
        return this.clientCert;
    }

    /** Null when neither source is configured — mTLS is simply off. */
    static readPem(): { cert: string; key: string } | null {
        const certPath = process.env[FspiopMtlsClientCertStore.ENV_CERT_PATH];
        const keyPath = process.env[FspiopMtlsClientCertStore.ENV_KEY_PATH];
        const hasCertPath = certPath != null && certPath.trim().length > 0;
        const hasKeyPath = keyPath != null && keyPath.trim().length > 0;

        if (hasCertPath || hasKeyPath) {
            if (!hasCertPath || !hasKeyPath) {
                throw new Error(
                    'FSPIOP_MTLS_CLIENT_CERT_PATH and FSPIOP_MTLS_CLIENT_KEY_PATH must be set together.',
                );
            }

            return {
                cert: fs.readFileSync(certPath!.trim(), 'utf-8'),
                key: fs.readFileSync(keyPath!.trim(), 'utf-8'),
            };
        }

        const cert = process.env[FspiopMtlsClientCertStore.ENV_CERT];
        const key = process.env[FspiopMtlsClientCertStore.ENV_KEY];
        const hasCert = cert != null && cert.trim().length > 0;
        const hasKey = key != null && key.trim().length > 0;

        if (!hasCert && !hasKey) {
            return null;
        }

        if (!hasCert || !hasKey) {
            throw new Error(
                'FSPIOP_MTLS_CLIENT_CERT and FSPIOP_MTLS_CLIENT_KEY must be set together.',
            );
        }

        return {
            cert: cert!.replace(/\\n/g, '\n'),
            key: key!.replace(/\\n/g, '\n'),
        };
    }
}

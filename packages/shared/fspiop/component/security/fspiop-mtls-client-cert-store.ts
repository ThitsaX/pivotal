// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Injectable} from '@nestjs/common';
import {ClientCert, ClientCertStore} from '@shared/security/component/cert';
import {PemPair, readPemPair} from './pem-pair';

/**
 * The certificate this service presents when it connects out to a peer.
 *
 * Signed by Pivotal's own CA, which is registered with the Hub so the Hub can verify
 * it. That is the opposite direction from the server certificate, which the Hub signs
 * -- see FspiopMtlsServerCertStore. The two are not interchangeable.
 */
@Injectable()
export class FspiopMtlsClientCertStore extends ClientCertStore {

    private static readonly ENV_NAMES = {
        certPath: 'FSPIOP_MTLS_CLIENT_CERT_PATH',
        keyPath: 'FSPIOP_MTLS_CLIENT_KEY_PATH',
        cert: 'FSPIOP_MTLS_CLIENT_CERT',
        key: 'FSPIOP_MTLS_CLIENT_KEY',
    };

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

    /** Null when neither source is configured -- mTLS is simply off. */
    static readPem(): PemPair | null {
        return readPemPair(FspiopMtlsClientCertStore.ENV_NAMES);
    }
}

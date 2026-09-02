// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Injectable} from '@nestjs/common';
import {PemPair, readPemPair} from './pem-pair';

/**
 * The certificate this service presents when a peer connects to it.
 *
 * Deliberately separate from the client certificate, and not interchangeable with it.
 * The two are issued by different authorities: the client leaf is signed by Pivotal's
 * own CA, whereas the server certificate is signed by the Hub's CA through inbound
 * enrollment, because the Hub verifies incoming connections against its own chain.
 * Presenting one where the other belongs produces a certificate the peer cannot
 * validate — and, against a peer that does not check, an mTLS setup that only appears
 * to work.
 */
@Injectable()
export class FspiopMtlsServerCertStore {

    private static readonly ENV_NAMES = {
        certPath: 'FSPIOP_MTLS_SERVER_CERT_PATH',
        keyPath: 'FSPIOP_MTLS_SERVER_KEY_PATH',
        cert: 'FSPIOP_MTLS_SERVER_CERT',
        key: 'FSPIOP_MTLS_SERVER_KEY',
    };

    private pair: PemPair | undefined;

    load(): FspiopMtlsServerCertStore {
        this.pair = FspiopMtlsServerCertStore.readPem() ?? undefined;

        return this;
    }

    get(): PemPair | undefined {
        return this.pair;
    }

    /** Null when neither source is configured. */
    static readPem(): PemPair | null {
        return readPemPair(FspiopMtlsServerCertStore.ENV_NAMES);
    }
}

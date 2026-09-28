// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as fs from 'node:fs';
import {Injectable} from '@nestjs/common';
import {Ca, CaStore} from '@shared/security/component/cert';

/**
 * The CA bundle used to decide whether the peer on the other end is who it claims.
 *
 * Two sources, and the file wins when both are set. A file is what a deployment
 * uses: the bundle arrives as a mounted Secret, which the kubelet updates in place,
 * so the material can change without the Deployment being edited. The environment
 * variable remains for local runs and for the sample connectors, where there is no
 * mount to read.
 */
@Injectable()
export class FspiopMtlsCaStore extends CaStore {

    private static readonly ENV_PEM = 'FSPIOP_MTLS_CA';
    private static readonly ENV_PATH = 'FSPIOP_MTLS_CA_PATH';

    private ca: Ca | undefined;

    load(): CaStore {
        const pem = FspiopMtlsCaStore.readPem();

        this.ca = pem == null ? undefined : Ca.fromBuffer(Buffer.from(pem, 'utf-8'));

        return this;
    }

    get(): Ca | undefined {
        return this.ca;
    }

    /** Null when neither source is configured — mTLS is simply off. */
    static readPem(): string | null {
        const path = process.env[FspiopMtlsCaStore.ENV_PATH];

        if (path != null && path.trim().length > 0) {
            // Deliberately not caught: a configured path that cannot be read is a
            // misconfiguration, and continuing without a trust anchor would mean
            // trusting whatever answered.
            return fs.readFileSync(path.trim(), 'utf-8');
        }

        const inline = process.env[FspiopMtlsCaStore.ENV_PEM];

        if (inline == null || inline.trim().length === 0) {
            return null;
        }

        return inline.replace(/\\n/g, '\n');
    }
}

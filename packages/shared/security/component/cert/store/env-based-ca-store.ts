// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Ca} from '../ca';
import {CaCert} from '../ca-cert';
import {CaStore} from '../ca-store';

export class EnvBasedCaStore extends CaStore {

    private static readonly ENV_CA_COUNT   = 'FSPIOP_MTLS_CA_COUNT';

    private static readonly ENV_CA_CONTENT = 'FSPIOP_MTLS_CA_CONTENT_';

    private combined: Ca | undefined;

    load(): CaStore {
        const countStr = process.env[EnvBasedCaStore.ENV_CA_COUNT];

        if (countStr == null || countStr.trim().length === 0) {
            return this;
        }

        const count = parseInt(countStr.trim(), 10);

        if (isNaN(count) || count <= 0) {
            return this;
        }

        const certs: CaCert[] = [];

        for (let i = 1; i <= count; i++) {
            const envName = `${EnvBasedCaStore.ENV_CA_CONTENT}${i}`;
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

        if (certs.length === 0) {
            return this;
        }

        const incoming = Buffer.concat(certs.map((c) => c.toBuffer()));
        this.combined = this.combined == null
            ? Ca.fromBuffer(incoming)
            : Ca.fromBuffer(Buffer.concat([this.combined.toBuffer(), incoming]));

        return this;
    }

    get(): Ca | undefined {
        return this.combined;
    }
}

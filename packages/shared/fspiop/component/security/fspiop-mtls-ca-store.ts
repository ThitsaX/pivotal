// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Injectable} from '@nestjs/common';
import {Ca, CaStore} from '@shared/security/component/cert';

@Injectable()
export class FspiopMtlsCaStore extends CaStore {

    private static readonly ENV_FSPIOP_MTLS_CA = 'FSPIOP_MTLS_CA';

    private ca: Ca | undefined;

    load(): CaStore {
        const caValue = process.env[FspiopMtlsCaStore.ENV_FSPIOP_MTLS_CA];

        if (caValue == null || caValue.trim().length === 0) {
            this.ca = undefined;
            return this;
        }

        const normalizedPem = caValue.replace(/\\n/g, '\n');
        this.ca = Ca.fromBuffer(Buffer.from(normalizedPem, 'utf-8'));

        return this;
    }

    get(): Ca | undefined {
        return this.ca;
    }
}

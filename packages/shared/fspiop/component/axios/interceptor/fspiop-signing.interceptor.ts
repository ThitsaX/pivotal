// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { InternalAxiosRequestConfig } from 'axios';
import { FspiopAxiosInterceptor } from '../fspiop-axios';
import { FspiopHeaders } from '../../fspiop-headers';
import { FspiopSignature } from '../../fspiop-signature';
import { PrivateKeyStore } from '@shared/security/component/key';

export class FspiopSigningInterceptor {

    constructor(private readonly privateKeyStore: PrivateKeyStore) {}

    build(): FspiopAxiosInterceptor {
        return (config: InternalAxiosRequestConfig) => {
            const source = config.headers?.[FspiopHeaders.Names.FSPIOP_SOURCE];

            if (!source) {
                return config;
            }

            const privateKey = this.privateKeyStore.get(String(source));

            if (!privateKey) {
                return config;
            }

            const body = FspiopSigningInterceptor.resolveBody(config);
            const headers = FspiopSigningInterceptor.resolveHeaders(config);
            const signatureHeader = FspiopSignature.sign(privateKey, headers, body);

            config.headers[FspiopHeaders.Names.FSPIOP_SIGNATURE] = JSON.stringify(signatureHeader);

            return config;
        };
    }

    private static resolveBody(config: InternalAxiosRequestConfig): string {
        if (config.data != null) {
            return typeof config.data === 'string'
                ? config.data
                : JSON.stringify(config.data);
        }

        const date = config.headers?.[FspiopHeaders.Names.DATE];
        return JSON.stringify({ date: date != null ? String(date) : '' });
    }

    private static resolveHeaders(config: InternalAxiosRequestConfig): Record<string, string> {
        const result: Record<string, string> = {};

        for (const [key, value] of Object.entries(config.headers ?? {})) {
            if (value != null && typeof value !== 'object') {
                result[key.toLowerCase()] = String(value);
            }
        }

        return result;
    }
}

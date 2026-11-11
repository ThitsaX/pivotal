// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { InternalAxiosRequestConfig } from 'axios';
import { FspiopAxiosInterceptor } from '../fspiop-axios';
import { FspiopAccessTokenProvider } from '../../security/fspiop-access-token-provider';

/**
 * Adds the Hub's bearer token to every outbound FSPIOP request.
 *
 * Independent of signing and of mutual TLS: the token says which client is calling, the
 * signature says which participant sent the message, and the certificate secures the connection.
 * The signature does not cover this header, so the order of the two interceptors does not matter.
 */
export class FspiopBearerTokenInterceptor {

    private static readonly AUTHORIZATION = 'Authorization';

    constructor(private readonly tokens: FspiopAccessTokenProvider) {}

    build(): FspiopAxiosInterceptor {
        return async (config: InternalAxiosRequestConfig) => {
            const token = await this.tokens.accessToken();

            config.headers[FspiopBearerTokenInterceptor.AUTHORIZATION] = `Bearer ${token}`;

            return config;
        };
    }
}

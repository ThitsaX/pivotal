// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import axios, {AxiosInstance} from 'axios';
import {Logger} from '@nestjs/common';
import {McmException} from '../exception';
import {McmSettings} from './mcm-settings';

/**
 * Exchanges client credentials for a Keycloak access token and caches it.
 *
 * MCM is control plane, so token traffic is independent of TPS: steady state is the
 * peer-refresh loop and a Hub CA poll. Caching until shortly before expiry keeps
 * that at a couple of requests a minute.
 *
 * **A token needs two things MCM will not tell you about.** It must carry an
 * audience of `connection-manager-api`, and it must carry a `groups` claim. Both
 * come from protocol mappers on the Keycloak client, and the stock service client
 * ships with neither. A missing `groups` claim is the harder failure to read: MCM's
 * `extractRoles` spreads the result of `claims.groups?.map(...)`, so an absent claim
 * throws `TypeError: roles is not iterable` server-side and returns a bare
 * `401 Authentication required` to the caller.
 */
export class McmTokenProvider {

    private static readonly EXPIRY_SKEW_MS = 30_000;

    private readonly logger = new Logger(McmTokenProvider.name);

    private token: string | null = null;
    private expiresAt = 0;

    private readonly client: AxiosInstance;

    constructor(
        private readonly settings: McmSettings,
        client?: AxiosInstance,
    ) {
        // A bare axios instance, deliberately: the shared builder attaches an HTTP
        // logger that writes response bodies, and this endpoint's response body is a
        // bearer token. Nothing on this path should reach the log.
        this.client = client ?? axios.create({
            timeout: settings.connectionTimeoutMs,
        });
    }

    async accessToken(): Promise<string> {
        if (this.token != null && Date.now() < this.expiresAt) {
            return this.token;
        }

        return this.fetch();
    }

    /** Drops the cached token so the next call re-authenticates. */
    invalidate(): void {
        this.token = null;
        this.expiresAt = 0;
    }

    private async fetch(): Promise<string> {
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.settings.clientId,
            client_secret: this.settings.clientSecret,
        });

        const response = await this.client.post<{ access_token?: string; expires_in?: number }>(
            this.settings.tokenUrl,
            body.toString(),
            {headers: {'Content-Type': 'application/x-www-form-urlencoded'}},
        );

        const accessToken = response.data?.access_token;

        if (accessToken == null || accessToken.length === 0) {
            throw new McmException(
                'MCM_TOKEN_UNAVAILABLE',
                `No access_token returned for client '${this.settings.clientId}'.`,
            );
        }

        const expiresInSeconds = response.data?.expires_in ?? 300;

        this.token = accessToken;
        this.expiresAt = Date.now() + (expiresInSeconds * 1_000) - McmTokenProvider.EXPIRY_SKEW_MS;

        this.logger.log(`Authenticated to MCM as client '${this.settings.clientId}'.`);

        return accessToken;
    }
}

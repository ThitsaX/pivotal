// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import axios, {AxiosInstance} from 'axios';
import {Logger} from '@nestjs/common';

/**
 * Obtains the bearer token the Hub's API gateway requires on every FSPIOP request.
 *
 * The gateway checks a token as well as the client certificate, so mutual TLS on its own is
 * refused. The token comes from the OAuth client-credentials grant against the Hub's identity
 * provider, for the client the Hub issued to Pivotal.
 *
 * This sits on the transfer path, so it is shaped for load rather than for a background job. One
 * token is shared by every request until shortly before it expires, and when it does, concurrent
 * requests wait on a single refresh instead of each starting their own. Without that, the moment
 * after expiry would send the identity provider one request per transfer in flight.
 */
export class FspiopAccessTokenProvider {

    /**
     * Refresh this long before the token's stated expiry, so a token is never sent with only
     * moments left and rejected in transit. Capped at half the lifetime, so a short-lived token
     * is still reused rather than refetched on every request.
     */
    private static readonly MAX_EXPIRY_SKEW_MS = 30_000;

    /** Assumed when the identity provider omits `expires_in`: short, so a guess is never held long. */
    private static readonly DEFAULT_EXPIRES_IN_SECONDS = 60;

    private readonly logger = new Logger(FspiopAccessTokenProvider.name);

    private readonly client: AxiosInstance;

    private token: string | null = null;
    private expiresAt = 0;
    private pending: Promise<string> | null = null;

    constructor(
        private readonly settings: FspiopAccessTokenProvider.Settings,
        client?: AxiosInstance,
    ) {
        // A bare axios instance, deliberately: the shared builder attaches an HTTP logger that
        // writes request and response bodies, and here the request carries the client secret and
        // the response carries the token.
        this.client = client ?? axios.create({timeout: settings.timeoutMs});
    }

    async accessToken(): Promise<string> {
        if (this.token != null && Date.now() < this.expiresAt) {
            return this.token;
        }

        if (this.pending == null) {
            this.pending = this.fetch().finally(() => {
                this.pending = null;
            });
        }

        return this.pending;
    }

    /** Drops the cached token so the next request re-authenticates. */
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

        let data: { access_token?: string; expires_in?: number } | undefined;

        try {
            const response = await this.client.post<{ access_token?: string; expires_in?: number }>(
                this.settings.tokenUrl,
                body.toString(),
                {headers: {'Content-Type': 'application/x-www-form-urlencoded'}},
            );

            data = response.data;
        } catch (error: unknown) {
            // Rethrown as a new error rather than passed on: an axios error carries the request it
            // failed on, and this request's body is the client secret. Whatever logs the failure
            // further up must not be handed it.
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;

            throw new Error(
                `Could not obtain a Hub access token for client '${this.settings.clientId}'`
                + (status != null ? ` (HTTP ${status}).` : '.'),
            );
        }

        const accessToken = data?.access_token;

        if (accessToken == null || accessToken.length === 0) {
            throw new Error(`No access_token returned for client '${this.settings.clientId}'.`);
        }

        const lifetimeMs = (data?.expires_in ?? FspiopAccessTokenProvider.DEFAULT_EXPIRES_IN_SECONDS) * 1_000;
        const skewMs = Math.min(FspiopAccessTokenProvider.MAX_EXPIRY_SKEW_MS, lifetimeMs / 2);

        this.token = accessToken;
        this.expiresAt = Date.now() + lifetimeMs - skewMs;

        this.logger.log(`Obtained a Hub access token for client '${this.settings.clientId}'.`);

        return accessToken;
    }
}

export namespace FspiopAccessTokenProvider {

    export interface Settings {
        tokenUrl: string;
        clientId: string;
        clientSecret: string;
        timeoutMs?: number;
    }
}

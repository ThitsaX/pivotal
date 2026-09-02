// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {AxiosError, AxiosInstance} from 'axios';
import {Logger} from '@nestjs/common';
import {AxiosClientBuilder} from '@shared/axios/component';
import {McmException} from '../exception';
import {
    DfspCa,
    DfspCredentials,
    HubCa,
    JwsCert,
    McmDfsp,
    PostDfspCaRequest,
    PostDfspRequest,
    PostJwsCertRequest,
} from '../dto';
import {McmSettings} from './mcm-settings';
import {McmTokenProvider} from './mcm-token-provider';

/**
 * REST client for the Mojaloop Connection Manager.
 *
 * MCM is a **registry, not a distributor**. Posting a CA here records it; it does
 * not put it in the Hub's ingress trust store. The Hub operator wires that out of
 * band, which is why drift between what is registered and what is trusted has to be
 * detected rather than assumed.
 */
export class McmAxios {

    private readonly logger = new Logger(McmAxios.name);

    private readonly client: AxiosInstance;
    private readonly tokens: McmTokenProvider;

    constructor(
        private readonly settings: McmSettings,
        client?: AxiosInstance,
        tokens?: McmTokenProvider,
    ) {
        this.client = client ?? AxiosClientBuilder.newBuilder()
            .withParams({
                socketTimeoutMs: settings.socketTimeoutMs,
                connectionTimeoutMs: settings.connectionTimeoutMs,
            })
            .withHttpLogger(true)
            .build();
        // The token provider builds its own client rather than sharing this one: the
        // shared builder logs response bodies, and its responses are bearer tokens.
        this.tokens = tokens ?? new McmTokenProvider(settings);
    }

    // ── tenants ──────────────────────────────────────────────────────────────

    async listDfsps(): Promise<Array<McmDfsp>> {
        return this.get('/dfsps');
    }

    async createDfsp(body: PostDfspRequest): Promise<{ id: string }> {
        return this.post('/dfsps', body);
    }

    // ── certificate authority ────────────────────────────────────────────────

    /**
     * Registers Pivotal's Hub-client **root** under one tenant.
     *
     * This is one certificate registered N times, not N certificates: MCM's model
     * assumes one DFSP is one organisation with one CA, and Pivotal is one
     * organisation fronting many. It works because MCM applies no uniqueness
     * constraint. Registering the CA rather than the leaf is what lets cert-manager
     * rotate every workload's certificate with no MCM interaction at all.
     */
    async registerCa(dfspId: string, body: PostDfspCaRequest): Promise<unknown> {
        return this.post(`/dfsps/${McmAxios.encodePathSegment(dfspId)}/ca`, body);
    }

    async getHubCa(): Promise<HubCa> {
        return this.get('/hub/ca');
    }

    /** What MCM currently holds for this tenant, so a re-post can be avoided. */
    async getDfspCa(dfspId: string): Promise<DfspCa> {
        return this.get(`/dfsps/${McmAxios.encodePathSegment(dfspId)}/ca`);
    }

    // ── JWS keys ─────────────────────────────────────────────────────────────

    async publishJwsKey(dfspId: string, body: PostJwsCertRequest): Promise<JwsCert> {
        return this.post(`/dfsps/${McmAxios.encodePathSegment(dfspId)}/jwscerts`, body);
    }

    async getJwsKey(dfspId: string): Promise<JwsCert> {
        return this.get(`/dfsps/${McmAxios.encodePathSegment(dfspId)}/jwscerts`);
    }

    /**
     * Every peer's key in **one** call. `/dfsps/jwscerts` sits outside the
     * `/dfsps/{dfspId}/` pattern, so pulling all peers needs one credential and one
     * token rather than one per tenant.
     */
    async listAllJwsKeys(): Promise<Array<JwsCert>> {
        return this.get('/dfsps/jwscerts');
    }

    /**
     * Publishes a key and asserts the stored PEM is byte-identical to what was sent.
     *
     * This replaces MCM's own validation signal rather than supplementing it. MCM
     * parses the PEM and records `validationState`, but nothing anywhere acts on the
     * result, and its validator is RSA-only. A read-back comparison catches
     * truncation, a failed write, the wrong tenant and later drift — none of which a
     * parse-only check would notice even for a key it accepts.
     */
    async publishAndVerifyJwsKey(dfspId: string, publicKey: string): Promise<JwsCert> {
        const published = await this.publishJwsKey(dfspId, {publicKey});
        const stored = await this.getJwsKey(dfspId);

        if (stored.publicKey !== publicKey) {
            throw new McmException(
                'MCM_JWS_KEY_MISMATCH',
                `Key stored for '${dfspId}' differs from the key published. `
                + 'MCM accepted the write but did not persist it verbatim.',
            );
        }

        this.logger.log(`Published and verified the JWS public key for '${dfspId}'.`);

        return published;
    }

    // ── credentials ──────────────────────────────────────────────────────────

    /**
     * **GET, never POST.** `POST /dfsps/{id}/credentials` calls Keycloak's
     * `generateNewClientSecret`, which invalidates the existing secret immediately
     * with no dual-secret grace period. Already-issued access tokens survive; only
     * the next token request needs the new secret.
     */
    async getCredentials(dfspId: string): Promise<DfspCredentials> {
        return this.get(`/dfsps/${McmAxios.encodePathSegment(dfspId)}/credentials`);
    }

    // ── transport ────────────────────────────────────────────────────────────

    private async get<ResponseType>(path: string): Promise<ResponseType> {
        return this.send(async headers => {
            const response = await this.client.get<ResponseType>(this.resolveUrl(path), {headers});
            return response.data;
        }, 'GET', path);
    }

    private async post<ResponseType, RequestType = unknown>(
        path: string,
        body: RequestType,
    ): Promise<ResponseType> {
        return this.send(async headers => {
            const response = await this.client.post<ResponseType>(this.resolveUrl(path), body, {headers});
            return response.data;
        }, 'POST', path);
    }

    /**
     * Retries once on 401 with a fresh token, because a cached token can expire
     * between the check and the call. A second 401 is a real authorization problem
     * and is surfaced.
     */
    private async send<ResponseType>(
        call: (headers: Record<string, string>) => Promise<ResponseType>,
        method: string,
        path: string,
    ): Promise<ResponseType> {
        try {
            return await call(await this.authHeaders());
        } catch (error: unknown) {
            if (McmAxios.isUnauthorized(error)) {
                this.tokens.invalidate();

                try {
                    return await call(await this.authHeaders());
                } catch (retryError: unknown) {
                    throw this.toException(retryError, method, path);
                }
            }

            throw this.toException(error, method, path);
        }
    }

    private async authHeaders(): Promise<Record<string, string>> {
        return {
            Authorization: `Bearer ${await this.tokens.accessToken()}`,
            'Content-Type': 'application/json',
        };
    }

    private static isUnauthorized(error: unknown): boolean {
        return (error as AxiosError)?.isAxiosError === true
            && (error as AxiosError).response?.status === 401;
    }

    private toException(error: unknown, method: string, path: string): McmException {
        if (error instanceof McmException) {
            return error;
        }

        const axiosError = error as AxiosError;
        const status = axiosError?.response?.status;

        if (status === 401) {
            // Worth naming, because MCM returns a bare "Authentication required" for
            // a token missing either its audience or its `groups` claim, and the
            // second case throws server-side rather than reporting an authz failure.
            return new McmException(
                'MCM_UNAUTHORIZED',
                `${method} ${path} was rejected. Three things make MCM answer this way: the token `
                + "is missing an audience of 'connection-manager-api'; it is missing a 'groups' "
                + 'claim; or its issuer does not match the one MCM discovered. The last is easy to '
                + 'miss — a token is issued for the host it was requested from, so fetching it by a '
                + 'different name than MCM expects produces a valid token MCM will not accept.',
            );
        }

        const detail = McmAxios.describe(axiosError);

        return new McmException('MCM_REQUEST_FAILED', `${method} ${path} failed${detail}`);
    }

    private static describe(error: AxiosError): string {
        const status = error?.response?.status;
        const data = error?.response?.data;
        const body = typeof data === 'string' ? data : data == null ? '' : JSON.stringify(data);

        if (status == null) {
            return error?.message == null ? '.' : `: ${error.message}`;
        }

        return body.length === 0 ? ` with status ${status}.` : ` with status ${status}: ${body}`;
    }

    private resolveUrl(path: string): string {
        const base = this.settings.baseUrl.replace(/\/+$/, '');
        return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
    }

    private static encodePathSegment(segment: string): string {
        return encodeURIComponent(segment);
    }
}

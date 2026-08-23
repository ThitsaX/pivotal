// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as fs from 'node:fs/promises';
import axios, {AxiosInstance} from 'axios';
import {Logger} from '@nestjs/common';
import {VaultSettings} from './vault-settings';

/**
 * A deliberately small Vault client: Kubernetes ServiceAccount login, and KV v2 reads.
 *
 * No Vault SDK. The two calls needed are a POST and a GET, and an SDK would be a large transitive
 * surface for that — the same reasoning applied on the Java side, which keeps the two
 * implementations comparable.
 *
 * **Not on the signing path.** Callers read at startup and on a rotation nudge, then cache. Vault
 * can be down and payments continue — that property is why Vault Transit was rejected
 * (`architecture.md` §0).
 */
export class VaultClient {

    private static readonly VAULT_TOKEN_HEADER = 'X-Vault-Token';

    private readonly logger = new Logger(VaultClient.name);

    private readonly http: AxiosInstance;

    private token: string | undefined;

    constructor(private readonly settings: VaultSettings) {
        this.http = axios.create({
            baseURL: settings.address,
            timeout: settings.timeoutMs,
            // A 404 is a normal answer — "no secret at that path" — not a failure.
            validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
        });
    }

    /**
     * Exchanges the pod's ServiceAccount token for a short-lived Vault token.
     *
     * Chosen over AppRole or a mounted token because the credential is the pod's own identity:
     * nothing to distribute, nothing to rotate, and the identity is already per-workload.
     */
    async login(): Promise<string> {

        const serviceAccountToken = await this.readServiceAccountToken();

        const response = await this.http.post(
            `/v1/auth/${this.settings.kubernetesAuthPath}/login`,
            {role: this.settings.role, jwt: serviceAccountToken},
        );

        const token = response.data?.auth?.client_token as string | undefined;

        if (token == null || token.length === 0) {
            throw new Error('Vault login returned no client_token.');
        }

        this.token = token;
        this.logger.log(`Authenticated to Vault at ${this.settings.address} as role '${this.settings.role}'`);

        return token;
    }

    /**
     * Reads one field from a KV v2 secret.
     *
     * @returns the value, or `undefined` when the secret or the field is absent — an absent secret
     *     is a normal answer, so callers can tell "not provisioned" from "Vault is broken"
     */
    async readKvField(path: string, field: string): Promise<string | undefined> {

        if (this.token == null) {
            await this.login();
        }

        // KV v2 inserts /data/ between the mount and the path, and nests the payload under data.data.
        const response = await this.http.get(
            `/v1/${this.settings.kvMount}/data/${path}`,
            {headers: {[VaultClient.VAULT_TOKEN_HEADER]: this.token}},
        );

        if (response.status === 404) {
            return undefined;
        }

        const value = response.data?.data?.data?.[field] as unknown;

        return typeof value === 'string' && value.length > 0 ? value : undefined;
    }

    /** Drops the cached token so the next read re-authenticates. */
    invalidateToken(): void {
        this.token = undefined;
    }

    private async readServiceAccountToken(): Promise<string> {

        try {
            return (await fs.readFile(this.settings.serviceAccountTokenPath, 'utf-8')).trim();
        } catch (error) {
            throw new Error(
                `Cannot read the Kubernetes ServiceAccount token at `
                + `${this.settings.serviceAccountTokenPath}. Outside Kubernetes, configure a `
                + `different KEY_PROVIDER rather than pointing this elsewhere. `
                + `Cause: ${(error as Error).message}`,
            );
        }
    }
}

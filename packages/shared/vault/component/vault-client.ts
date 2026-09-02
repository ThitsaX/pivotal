// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as fs from 'node:fs/promises';
import axios, {AxiosInstance} from 'axios';
import {Logger} from '@nestjs/common';
import {VaultAuthMethod, VaultSettings} from './vault-settings';

/**
 * A deliberately small Vault client: Kubernetes ServiceAccount login, KV v2 reads, and PKI signing.
 *
 * No Vault SDK. The calls needed are a handful of POSTs and a GET, and an SDK would be a large
 * transitive surface for that — the same reasoning applied on the Java side, which keeps the two
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

        if (this.settings.authMethod === VaultAuthMethod.Token) {
            // Local development and integration tests only — see VaultAuthMethod.Token.
            this.logger.warn(
                'Authenticating to Vault with a supplied token. This is a development path; '
                + 'deployments must use Kubernetes ServiceAccount auth.',
            );
            this.token = this.settings.token;
            return this.token;
        }

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

    /**
     * Signs an externally supplied CSR against a PKI role.
     *
     * **`sign`, never `issue`.** `issue` has Vault generate the keypair and return the private key,
     * which would contradict the guarantee the DFSP-facing leg is built on: the DFSP's private key
     * never leaves the DFSP. Only the public key and the proof of possession inside the CSR cross
     * the boundary.
     *
     * The common name is passed separately and Vault's role is configured to require it, so the
     * caller decides the subject rather than the submitter. Nothing else from the CSR's subject is
     * honoured.
     */
    async signCertificate(request: VaultClient.SignRequest): Promise<VaultClient.SignedCertificate> {

        if (this.token == null) {
            await this.login();
        }

        const response = await this.http.post(
            `/v1/${request.mount}/sign/${request.role}`,
            {
                csr: request.csrPem,
                common_name: request.commonName,
                ...(request.ttl == null ? {} : {ttl: request.ttl}),
                exclude_cn_from_sans: true,
            },
            {headers: {[VaultClient.VAULT_TOKEN_HEADER]: this.token}},
        );

        if (response.status === 404) {
            throw new Error(
                `Vault has no PKI role '${request.role}' on mount '${request.mount}'.`);
        }

        const data = response.data?.data;
        const certificate = data?.certificate as string | undefined;

        if (certificate == null || certificate.length === 0) {
            throw new Error('Vault signed the request but returned no certificate.');
        }

        // ca_chain omits the leaf and is ordered issuer-first. Falling back to issuing_ca covers a
        // mount whose intermediate is the only thing above the leaf.
        const chain = (data?.ca_chain as string[] | undefined)
            ?? (typeof data?.issuing_ca === 'string' ? [data.issuing_ca] : []);

        return {
            certificatePem: certificate,
            caChainPem: chain.length === 0 ? undefined : chain.join('\n'),
            serialNumber: (data?.serial_number as string | undefined) ?? '',
            expiration: typeof data?.expiration === 'number' ? new Date(data.expiration * 1000) : undefined,
        };
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

export namespace VaultClient {

    export interface SignRequest {
        /** The PKI mount, for example `pki_dfsp`. */
        mount: string;
        role: string;
        csrPem: string;
        /** Enforced by the caller; the CSR's own subject is not honoured. */
        commonName: string;
        /** Vault's role default applies when omitted. */
        ttl?: string;
    }

    export interface SignedCertificate {
        certificatePem: string;
        caChainPem?: string;
        serialNumber: string;
        expiration?: Date;
    }
}

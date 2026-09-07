// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as fs from 'node:fs/promises';
import axios, {AxiosInstance, AxiosResponse} from 'axios';
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

    /**
     * How far ahead of expiry a token is replaced.
     *
     * A Vault token is issued with a lease measured in whole seconds, and the request that uses it
     * still has to travel. Renewing exactly at expiry would race both, so a token is treated as
     * spent slightly early — the cost is one extra login per lease, the alternative is a request
     * that fails for no reason the caller can act on.
     */
    private static readonly RENEWAL_MARGIN_MS = 60_000;

    private readonly logger = new Logger(VaultClient.name);

    private readonly http: AxiosInstance;

    private token: string | undefined;

    /** When the current token stops being usable; absent for a supplied development token. */
    private tokenExpiresAt: number | undefined;

    /** Set once the KV mount has been confirmed as version 2, or found unverifiable. */
    private kvVersionAccepted = false;

    constructor(private readonly settings: VaultSettings) {
        this.http = axios.create({
            baseURL: settings.address,
            timeout: settings.timeoutMs,
            // A 404 is a normal answer — "no secret at that path" — not a failure. 401 and 403 are
            // let through so an expired token can be told apart from a policy that does not grant
            // the path: the first is recoverable here, the second needs a person.
            validateStatus: (status) =>
                (status >= 200 && status < 300)
                || status === 401 || status === 403 || status === 404,
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
            this.tokenExpiresAt = undefined;
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

        // Vault states the lease when it issues the token, so how long this is good for is known
        // rather than guessed. A response without one is treated as short-lived: renewing more
        // often than necessary costs a login, assuming a long life costs an outage.
        const leaseSeconds = response.data?.auth?.lease_duration as unknown;

        this.token = token;
        this.tokenExpiresAt = typeof leaseSeconds === 'number' && leaseSeconds > 0
            ? Date.now() + leaseSeconds * 1000
            : Date.now() + VaultClient.RENEWAL_MARGIN_MS;

        this.logger.log(`Authenticated to Vault at ${this.settings.address} as role '${this.settings.role}'`);

        return token;
    }

    /**
     * The token to send, logging in again when the current one is spent.
     *
     * Renewal happens **before** the request rather than after it fails. A client that only reacts
     * to rejection spends one failed call per lease, and a caller that does not know to retry —
     * certificate issuance was one — simply stops working an hour after the process starts, with
     * a 403 that reads like a missing policy.
     */
    private async currentToken(): Promise<string> {

        const spent = this.tokenExpiresAt != null
            && Date.now() >= this.tokenExpiresAt - VaultClient.RENEWAL_MARGIN_MS;

        if (this.token == null || spent) {
            await this.login();
        }

        return this.token as string;
    }

    /**
     * Sends an authenticated request, replacing the token once if Vault rejects it.
     *
     * The retry covers what an expiry check cannot: a token revoked early, a Vault restart, or
     * clock skew between here and the server. It runs **once** — a second rejection with a token
     * seconds old is a policy that does not grant the path, and repeating the call would turn a
     * clear configuration error into a loop.
     */
    private async authenticated<T>(
        describe: string,
        send: (token: string) => Promise<AxiosResponse<T>>,
    ): Promise<AxiosResponse<T>> {

        const first = await send(await this.currentToken());

        if (!VaultClient.isTokenRejection(first.status)) {
            return first;
        }

        this.invalidateToken();

        const second = await send(await this.currentToken());

        if (VaultClient.isTokenRejection(second.status)) {
            // Said plainly, because the same status means two very different things and only one
            // of them is worth investigating in Vault's audit log.
            throw new Error(
                `${describe} was refused by Vault with status ${second.status} using a freshly `
                + `issued token. This is the role's policy, not an expired credential — check that `
                + `'${this.settings.role}' grants the path.`,
            );
        }

        return second;
    }

    private static isTokenRejection(status: number): boolean {
        return status === 401 || status === 403;
    }

    /**
     * Refuses to use a KV mount that is not version 2.
     *
     * This client speaks v2: it inserts `/data/` between mount and path and nests the payload under
     * `data`. Against a v1 mount that is **self-consistent but wrong** — it writes
     * `{"data":{...}}` to a literal `data/...` path and reads it back the same way, so everything
     * appears to work while living somewhere no `vault kv` command addresses. An operator writing a
     * key by hand puts it where the application never looks, and the application's own keys are
     * invisible to the CLI. Both halves are silent.
     *
     * Checked once, lazily, on first use of the KV engine rather than at construction, so a
     * deployment that never touches KV is not made to depend on Vault to start.
     */
    private async assertKvVersionTwo(): Promise<void> {

        if (this.kvVersionAccepted) {
            return;
        }

        let version: string | undefined;

        try {
            const response = await this.http.get(
                `/v1/sys/internal/ui/mounts/${this.settings.kvMount}`,
                {headers: {[VaultClient.VAULT_TOKEN_HEADER]: await this.currentToken()}},
            );

            version = response.status >= 200 && response.status < 300
                ? response.data?.data?.options?.version as string | undefined
                : undefined;
        } catch {
            // An unreachable mount table is not evidence of a bad mount.
            version = undefined;
        }

        if (version != null && version !== '2') {
            throw new Error(
                `Vault mount '${this.settings.kvMount}' is KV version ${version}; this client `
                + 'speaks version 2. On a version 1 mount every read and write lands at a literal '
                + "'data/' path that no vault kv command addresses, so keys written by hand and "
                + 'keys written by this service never meet. Mount a KV v2 engine and point '
                + 'VAULT_KV_MOUNT at it.',
            );
        }

        if (version == null) {
            // Not every role can read the mount table, and refusing on an inconclusive answer would
            // take down a deployment that is configured correctly. Warned rather than silent, so
            // the gap is a known one.
            this.logger.warn(
                `Could not determine the KV version of Vault mount '${this.settings.kvMount}'; `
                + 'continuing as though it were version 2. Grant read on '
                + "'sys/internal/ui/mounts/*' to have this verified.",
            );
        }

        this.kvVersionAccepted = true;
    }

    /**
     * Reads one field from a KV v2 secret.
     *
     * @returns the value, or `undefined` when the secret or the field is absent — an absent secret
     *     is a normal answer, so callers can tell "not provisioned" from "Vault is broken"
     */
    async readKvField(path: string, field: string): Promise<string | undefined> {

        await this.assertKvVersionTwo();

        // KV v2 inserts /data/ between the mount and the path, and nests the payload under data.data.
        const response = await this.authenticated(
            `Reading '${field}' from Vault path '${path}'`,
            (token) => this.http.get(
                `/v1/${this.settings.kvMount}/data/${path}`,
                {headers: {[VaultClient.VAULT_TOKEN_HEADER]: token}},
            ),
        );

        if (response.status === 404) {
            return undefined;
        }

        const value = response.data?.data?.data?.[field] as unknown;

        return typeof value === 'string' && value.length > 0 ? value : undefined;
    }

    /**
     * Writes a single field into a KV v2 secret, creating the secret if it is not there.
     *
     * **Read-modify-write, not blind overwrite.** A KV v2 write replaces the whole payload, so
     * writing one field naively would delete every other field at that path. Under the HSM profile
     * the same path holds a key reference alongside crypto-user credentials, and losing either
     * would strand a tenant's key inside the HSM with no way to address it.
     */
    async writeKvField(path: string, field: string, value: string): Promise<void> {

        await this.assertKvVersionTwo();

        const existing = await this.readKv(path);

        const response = await this.authenticated(
            `Writing '${field}' to Vault path '${path}'`,
            (token) => this.http.post(
                `/v1/${this.settings.kvMount}/data/${path}`,
                {data: {...existing, [field]: value}},
                {headers: {[VaultClient.VAULT_TOKEN_HEADER]: token}},
            ),
        );

        if (response.status >= 400) {
            throw new Error(
                `Writing '${field}' to Vault path '${path}' failed with status ${response.status}.`,
            );
        }
    }

    /** Every field at a KV v2 path, or an empty object when the secret does not exist. */
    private async readKv(path: string): Promise<Record<string, string>> {

        const response = await this.authenticated(
            `Reading Vault path '${path}'`,
            (token) => this.http.get(
                `/v1/${this.settings.kvMount}/data/${path}`,
                {headers: {[VaultClient.VAULT_TOKEN_HEADER]: token}},
            ),
        );

        if (response.status === 404) {
            return {};
        }

        const data = response.data?.data?.data as unknown;

        return typeof data === 'object' && data != null ? data as Record<string, string> : {};
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

        const response = await this.authenticated(
            `Signing a certificate for '${request.commonName}' on '${request.mount}/sign/${request.role}'`,
            (token) => this.http.post(
                `/v1/${request.mount}/sign/${request.role}`,
                {
                    csr: request.csrPem,
                    common_name: request.commonName,
                    ...(request.ttl == null ? {} : {ttl: request.ttl}),
                    exclude_cn_from_sans: true,
                },
                {headers: {[VaultClient.VAULT_TOKEN_HEADER]: token}},
            ),
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

    /**
     * Reads a PKI mount's own certificate chain — the authority that signs its leaves.
     *
     * Unauthenticated by design in Vault: a CA certificate is public, and this endpoint exists so
     * anything needing to verify the chain can fetch it without a credential. Read here through
     * the same client for one timeout and one base URL rather than a second HTTP path.
     *
     * @returns the chain as PEM, or null when the mount has no CA yet
     */
    async readPkiCaChain(mount: string): Promise<string | null> {

        const response = await this.http.get(`/v1/${mount}/ca_chain`, {
            // The PEM endpoints answer with text, not the usual JSON envelope.
            responseType: 'text',
            headers: {Accept: 'application/pem-certificate-chain'},
        });

        if (response.status === 404) {
            return null;
        }

        const chain = typeof response.data === 'string' ? response.data.trim() : '';

        return chain.length === 0 ? null : chain;
    }

    /**
     * Drops the cached token so the next call re-authenticates.
     *
     * Kept public for a caller that learns a credential is bad by some other route. Routine expiry
     * no longer needs it — every authenticated call renews ahead of the lease and retries once on
     * rejection — and a caller that has to remember this is a caller that can forget.
     */
    invalidateToken(): void {
        this.token = undefined;
        this.tokenExpiresAt = undefined;
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

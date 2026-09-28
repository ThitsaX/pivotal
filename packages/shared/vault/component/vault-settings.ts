// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

/**
 * Where key material is read from.
 *
 * The value is a deployment profile, not a preference — see `architecture.md` §0. Both profiles
 * read from Vault; they differ in *what* the Vault path holds and therefore where signing happens.
 */
export enum KeyProvider {

    /**
     * The Vault KV path holds the private key PEM; signing is in-process. The **KMS-backed**
     * profile. Isolation comes from per-tenant Vault path policy, not from a hardware boundary.
     */
    VaultKv = 'vault-kv',

    /**
     * The Vault KV path holds an opaque `keyRef` plus crypto-user credentials, and signing happens
     * inside CloudHSM. The **HSM-backed** profile. Not implemented yet.
     */
    Pkcs11 = 'pkcs11',

    /**
     * Keys are read from `participant_key` in MySQL.
     *
     * **Legacy and development only.** This is the interim state recorded as S1: it let the signing
     * contract land before Vault existed. Private keys sit in the database in plaintext, so it must
     * not be used where real value moves.
     */
    Database = 'database',
}

export namespace KeyProvider {

    const VALUES: readonly string[] = [KeyProvider.VaultKv, KeyProvider.Pkcs11, KeyProvider.Database];

    /**
     * Parses `KEY_PROVIDER`. An unrecognised value **throws** rather than falling back: silently
     * defaulting would decide where private keys come from on the basis of a typo.
     */
    export function parse(value: string | null | undefined, fallback: KeyProvider): KeyProvider {

        if (value == null || value.trim().length === 0) {
            return fallback;
        }

        const normalized = value.trim().toLowerCase();

        if (!VALUES.includes(normalized)) {
            throw new Error(
                `Invalid KEY_PROVIDER: '${value}'. Expected one of ${VALUES.join(', ')}.`,
            );
        }

        return normalized as KeyProvider;
    }
}

/**
 * How a workload proves its identity to Vault.
 */
export enum VaultAuthMethod {

    /**
     * The pod's projected ServiceAccount token is exchanged for a Vault token. The production
     * method: nothing to distribute, nothing to rotate, and the identity is the pod's own.
     */
    Kubernetes = 'kubernetes',

    /**
     * A Vault token supplied directly.
     *
     * **For local development and integration tests.** There is no kubelet outside Kubernetes to
     * project a ServiceAccount token, so this is the only way to reach a Vault running in Docker.
     * It is a long-lived credential carried in configuration, which is exactly what the Kubernetes
     * method exists to avoid — do not use it in a deployment.
     */
    Token = 'token',
}

/**
 * Connection and path settings for Vault.
 *
 * Vault is read at startup and on a rotation nudge — never on the signing path — so none of these
 * affect request latency.
 */
export class VaultSettings {

    /** Where the kubelet projects the pod's ServiceAccount token. */
    static readonly DEFAULT_SERVICE_ACCOUNT_TOKEN_PATH =
        '/var/run/secrets/kubernetes.io/serviceaccount/token';

    constructor(
        /** Vault base URL, e.g. `https://vault.internal:8200`. */
        public readonly address: string,

        /** Vault Kubernetes auth role bound to this workload's ServiceAccount. */
        public readonly role: string,

        /** Mount path of the Kubernetes auth method. */
        public readonly kubernetesAuthPath: string = 'kubernetes',

        /** KV v2 mount holding the signing keys. */
        public readonly kvMount: string = 'secret',

        /** Path prefix; a tenant's key is read from `<prefix>/<fspId>`. */
        public readonly jwsKeyPathPrefix: string = 'pivotal/jwskey',

        public readonly serviceAccountTokenPath: string =
        VaultSettings.DEFAULT_SERVICE_ACCOUNT_TOKEN_PATH,

        /** Request timeout. Generous: this is startup, not the request path. */
        public readonly timeoutMs: number = 10_000,

        public readonly authMethod: VaultAuthMethod = VaultAuthMethod.Kubernetes,

        /** Only read when {@link authMethod} is {@link VaultAuthMethod.Token}. */
        public readonly token: string = '',
    ) {
    }

    isConfigured(): boolean {

        if (this.address.trim().length === 0) {
            return false;
        }

        return this.authMethod === VaultAuthMethod.Token
            ? this.token.trim().length > 0
            : this.role.trim().length > 0;
    }
}

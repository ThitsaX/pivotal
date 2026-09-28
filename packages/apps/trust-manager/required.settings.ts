// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ConfigService} from '@nestjs/config';
import {TrustDomainModule, DfspCaPublishScheduler} from '@core/trust/domain';
import {CentralLedgerAxiosParams} from '@shared/central-ledger';
import {McmSettings} from '@shared/mcm-client';
import {TypeOrmSettings} from '@shared/typeorm';
import {KeyProvider, VaultAuthMethod, VaultSettings} from '@shared/vault';

export class TrustManagerSettings implements TrustDomainModule.RequiredSettings {

    private static readonly DEFAULT_PEER_JWS_SYNC_INTERVAL_SECONDS = 300;
    private static readonly DEFAULT_HUB_CA_SYNC_INTERVAL_SECONDS = 3600;
    private static readonly DEFAULT_HUB_CA_SECRET_NAME = 'hub-ca-bundle';
    private static readonly DEFAULT_MCM_CA_RECONCILE_INTERVAL_SECONDS = 3600;
    private static readonly DEFAULT_JWS_KEY_PUBLISH_INTERVAL_SECONDS = 3600;
    private static readonly DEFAULT_HUB_SERVER_CERT_SECRET_NAME = 'hub-server-cert';
    private static readonly DEFAULT_HUB_SERVER_CERT_CHECK_INTERVAL_SECONDS = 86400;

    constructor(private readonly configService: ConfigService) {}

    // ── MCM ──────────────────────────────────────────────────────────────────

    mcmSettings(): McmSettings {
        return new McmSettings(
            this.readRequiredString('MCM_BASE_URL'),
            this.readRequiredString('MCM_TOKEN_URL'),
            this.readRequiredString('MCM_CLIENT_ID'),
            this.readRequiredString('MCM_CLIENT_SECRET'),
        );
    }

    /**
     * Where signing-tenant announcements arrive from.
     *
     * Publication also happens on a periodic reconcile, so a deployment without NATS still works —
     * a newly provisioned tenant simply waits for the next sweep instead of being published within
     * seconds of onboarding.
     */
    natsUrl(): string {
        return this.read('NATS_URL') ?? '';
    }

    redisUrl(): string {
        return this.readRequiredString('REDIS_URL');
    }

    peerJwsSyncIntervalMs(): number {
        const configured = this.configService.get<string>('PEER_JWS_SYNC_INTERVAL_SECONDS');
        const seconds = configured == null || configured.trim().length === 0
            ? TrustManagerSettings.DEFAULT_PEER_JWS_SYNC_INTERVAL_SECONDS
            : Number(configured);

        if (!Number.isInteger(seconds) || seconds <= 0) {
            throw new Error('Invalid PEER_JWS_SYNC_INTERVAL_SECONDS: expected a positive integer.');
        }

        return seconds * 1000;
    }

    /**
     * Where the DFSP-facing CA is read from, and which gateway credential it is published to.
     *
     * Absent gateway settings mean this deployment fronts no DFSP-facing mutual TLS endpoint, and
     * the job stays idle rather than failing — most deployments will not have one on day one.
     */
    dfspCaPublishSettings(): DfspCaPublishScheduler.Settings {
        return new DfspCaPublishScheduler.Settings(
            this.read('DFSP_CA_PKI_MOUNT') ?? 'pki_dfsp',
            this.read('DFSP_CA_ROOT_PKI_MOUNT') ?? 'pki_dfsp_root',
            this.read('DFSP_CA_GATEWAY_NAMESPACE') ?? '',
            this.read('DFSP_CA_GATEWAY_SECRET_NAME') ?? '',
        );
    }

    dfspCaPublishIntervalMs(): number {
        const configured = this.read('DFSP_CA_PUBLISH_INTERVAL_SECONDS');
        const seconds = configured == null ? 3600 : Number(configured);

        if (!Number.isInteger(seconds) || seconds <= 0) {
            throw new Error('DFSP_CA_PUBLISH_INTERVAL_SECONDS must be a positive whole number of seconds.');
        }

        return seconds * 1000;
    }

    private read(name: string): string | undefined {
        const value = this.configService.get<string>(name);

        return value == null || value.trim().length === 0 ? undefined : value.trim();
    }

    hubCaSecretName(): string {
        const configured = this.configService.get<string>('HUB_CA_SECRET_NAME');

        return configured == null || configured.trim().length === 0
            ? TrustManagerSettings.DEFAULT_HUB_CA_SECRET_NAME
            : configured;
    }

    hubCaSyncIntervalMs(): number {
        const configured = this.configService.get<string>('HUB_CA_SYNC_INTERVAL_SECONDS');
        const seconds = configured == null || configured.trim().length === 0
            ? TrustManagerSettings.DEFAULT_HUB_CA_SYNC_INTERVAL_SECONDS
            : Number(configured);

        if (!Number.isInteger(seconds) || seconds <= 0) {
            throw new Error('Invalid HUB_CA_SYNC_INTERVAL_SECONDS: expected a positive integer.');
        }

        return seconds * 1000;
    }

    pivotalCaPath(): string {
        return this.readRequiredString('PIVOTAL_CA_PATH');
    }

    mcmCaReconcileIntervalMs(): number {
        const configured = this.configService.get<string>('MCM_CA_RECONCILE_INTERVAL_SECONDS');
        const seconds = configured == null || configured.trim().length === 0
            ? TrustManagerSettings.DEFAULT_MCM_CA_RECONCILE_INTERVAL_SECONDS
            : Number(configured);

        if (!Number.isInteger(seconds) || seconds <= 0) {
            throw new Error('Invalid MCM_CA_RECONCILE_INTERVAL_SECONDS: expected a positive integer.');
        }

        return seconds * 1000;
    }

    jwsKeyPublishIntervalMs(): number {
        const configured = this.configService.get<string>('JWS_KEY_PUBLISH_INTERVAL_SECONDS');
        const seconds = configured == null || configured.trim().length === 0
            ? TrustManagerSettings.DEFAULT_JWS_KEY_PUBLISH_INTERVAL_SECONDS
            : Number(configured);

        if (!Number.isInteger(seconds) || seconds <= 0) {
            throw new Error('Invalid JWS_KEY_PUBLISH_INTERVAL_SECONDS: expected a positive integer.');
        }

        return seconds * 1000;
    }

    pivotalDfspId(): string {
        return this.readRequiredString('PIVOTAL_DFSP_ID');
    }

    hubServerCertCommonName(): string {
        return this.readRequiredString('HUB_SERVER_CERT_COMMON_NAME');
    }

    hubServerCertSecretName(): string {
        const configured = this.configService.get<string>('HUB_SERVER_CERT_SECRET_NAME');

        return configured == null || configured.trim().length === 0
            ? TrustManagerSettings.DEFAULT_HUB_SERVER_CERT_SECRET_NAME
            : configured;
    }

    hubServerCertCheckIntervalMs(): number {
        const configured = this.configService.get<string>('HUB_SERVER_CERT_CHECK_INTERVAL_SECONDS');
        const seconds = configured == null || configured.trim().length === 0
            ? TrustManagerSettings.DEFAULT_HUB_SERVER_CERT_CHECK_INTERVAL_SECONDS
            : Number(configured);

        if (!Number.isInteger(seconds) || seconds <= 0) {
            throw new Error('Invalid HUB_SERVER_CERT_CHECK_INTERVAL_SECONDS: expected a positive integer.');
        }

        return seconds * 1000;
    }

    // ── inherited from the participant domain ────────────────────────────────

    writeTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readRequiredString('DB_WRITE_HOST'),
            this.readRequiredPositiveInteger('DB_WRITE_PORT'),
            this.readRequiredString('DB_WRITE_USERNAME'),
            this.readRequiredString('DB_WRITE_PASSWORD'),
            this.readRequiredString('DB_WRITE_NAME'),
        );
    }

    readTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readRequiredString('DB_READ_HOST'),
            this.readRequiredPositiveInteger('DB_READ_PORT'),
            this.readRequiredString('DB_READ_USERNAME'),
            this.readRequiredString('DB_READ_PASSWORD'),
            this.readRequiredString('DB_READ_NAME'),
        );
    }

    centralLedgerUrl(): string {
        return this.readRequiredString('CENTRAL_LEDGER_URL');
    }

    centralLedgerAxiosParams(): CentralLedgerAxiosParams {
        return {};
    }

    /**
     * trust-manager reads no private key on this path — the peer sync handles public
     * halves only. Declared because the participant domain constructs its key source
     * eagerly; `database` keeps that construction inert.
     */
    keyProvider(): KeyProvider {
        return KeyProvider.Database;
    }

    /**
     * Vault is read, never written to and never signed with.
     *
     * The only thing this service needs from Vault is the DFSP-facing CA certificate it
     * publishes to the ingress gateway. That is why `keyProvider` above stays on the database
     * path: no signing key is ever fetched here. Reading a CA is a different job, and it does
     * need a real address -- an empty one throws `Invalid URL` at the first read, which reads
     * as a broken gateway rather than as missing configuration.
     *
     * Absent settings leave the CA publish job idle rather than failing, so a deployment that
     * fronts no DFSP-facing endpoint needs none of this.
     */
    vaultSettings(): VaultSettings {
        return new VaultSettings(
            this.read('VAULT_ADDRESS') ?? '',
            this.read('VAULT_ROLE') ?? '',
            this.read('VAULT_KUBERNETES_AUTH_PATH') ?? 'kubernetes',
            this.read('VAULT_KV_MOUNT') ?? 'secret',
            this.read('VAULT_JWS_KEY_PATH_PREFIX') ?? 'pivotal/jwskey',
            this.read('VAULT_SERVICE_ACCOUNT_TOKEN_PATH')
                ?? VaultSettings.DEFAULT_SERVICE_ACCOUNT_TOKEN_PATH,
            10_000,
            this.readVaultAuthMethod(),
            this.read('VAULT_TOKEN') ?? '',
        );
    }

    /**
     * How this workload authenticates to Vault. Defaults to Kubernetes ServiceAccount auth; the
     * token method exists only so a Vault running outside Kubernetes can be reached during local
     * development, where there is no kubelet to project a ServiceAccount token.
     */
    private readVaultAuthMethod(): VaultAuthMethod {

        const value = this.read('VAULT_AUTH_METHOD');

        if (value == null || value.trim().length === 0) {
            return VaultAuthMethod.Kubernetes;
        }

        const normalized = value.trim().toLowerCase();

        if (normalized !== VaultAuthMethod.Kubernetes && normalized !== VaultAuthMethod.Token) {
            throw new Error(
                `Invalid VAULT_AUTH_METHOD: '${value}'. Expected `
                + `${VaultAuthMethod.Kubernetes} or ${VaultAuthMethod.Token}.`,
            );
        }

        return normalized as VaultAuthMethod;
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private readRequiredString(name: string): string {
        const value = this.configService.get<string>(name);

        if (value == null || value.trim().length === 0) {
            throw new Error(`Missing required environment variable: ${name}`);
        }

        return value;
    }

    private readRequiredPositiveInteger(name: string): number {
        const parsed = Number(this.readRequiredString(name));

        if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new Error(`Invalid environment variable ${name}: expected a positive integer.`);
        }

        return parsed;
    }
}

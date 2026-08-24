// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ConfigService} from '@nestjs/config';
import {CentralLedgerAxiosParams} from '@shared/central-ledger';
import {
    FspiopJwsPrivateKeyStore,
    FspiopJwsPublicKeyStore,
    FspiopMtlsCaStore,
    FspiopMtlsClientCertStore,
    FspiopSettings,
    FspiopVerifyMode,
} from '@shared/fspiop';
import {
    CaStore,
    ClientCertStore,
    PrivateKeyStore,
    PublicKeyStore,
} from '@shared/security';
import {TypeOrmSettings} from '@shared/typeorm';
import {KeyProvider, VaultAuthMethod, VaultSettings} from '@shared/vault';
import type {WebInboundModule} from './web-inbound.module';

export class WebInboundSettings implements WebInboundModule.RequiredSettings {

    private readonly inboundPublicKeyStore: PublicKeyStore;
    private readonly inboundPrivateKeyStore: PrivateKeyStore;
    private readonly inboundCaStore: CaStore;
    private readonly inboundClientCertStore: ClientCertStore;

    constructor(private readonly configService: ConfigService = new ConfigService()) {
        this.inboundPublicKeyStore = new FspiopJwsPublicKeyStore().load();
        this.inboundPrivateKeyStore = new FspiopJwsPrivateKeyStore().load();
        this.inboundCaStore = new FspiopMtlsCaStore().load();
        this.inboundClientCertStore = new FspiopMtlsClientCertStore().load();
    }

    natsUrl(): string {
        return this.readRequiredString('NATS_URL');
    }

    writeTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readRequiredString('DB_WRITE_HOST'),
            this.readPort('DB_WRITE_PORT'),
            this.readRequiredString('DB_WRITE_USERNAME'),
            this.readRequiredString('DB_WRITE_PASSWORD'),
            this.readRequiredString('DB_WRITE_NAME'),
        );
    }

    readTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readRequiredString('DB_READ_HOST'),
            this.readPort('DB_READ_PORT'),
            this.readRequiredString('DB_READ_USERNAME'),
            this.readRequiredString('DB_READ_PASSWORD'),
            this.readRequiredString('DB_READ_NAME'),
        );
    }

    centralLedgerUrl(): string {
        return this.readRequiredString('CENTRAL_LEDGER_URL');
    }

    centralLedgerAxiosParams(): CentralLedgerAxiosParams {
        const socketTimeoutMs = this.readPositiveInteger('CENTRAL_LEDGER_SOCKET_TIMEOUT_MS');
        const connectionTimeoutMs = this.readPositiveInteger('CENTRAL_LEDGER_CONNECTION_TIMEOUT_MS');

        return {
            socketTimeoutMs,
            connectionTimeoutMs,
        };
    }

    fspiopSettings(): FspiopSettings {
        return new FspiopSettings(
            this.readRequiredString('FSPIOP_SWITCH_ID'),
            this.readRequiredString('FSPIOP_PARTIES_URL'),
            this.readRequiredString('FSPIOP_QUOTES_URL'),
            this.readRequiredString('FSPIOP_TRANSFERS_URL'),
            this.readRequiredBoolean('FSPIOP_USE_JWS'),
            this.readRequiredBoolean('FSPIOP_USE_MUTUAL_TLS'),
            this.readVerifyMode('FSPIOP_JWS_VERIFY_MODE'),
        );
    }

    /**
     * Default inbound verification mode. Optional: an absent value means `off`, which is the
     * correct state for a deployment that has enabled signing but not yet verification.
     *
     * A *present but unrecognised* value throws rather than falling back — a typo here would
     * silently disable verification across every source that has no row of its own.
     */
    private readVerifyMode(name: string): FspiopVerifyMode {
        const value = this.configService.get<string>(name);

        if (value == null || value.trim().length === 0) {
            return FspiopVerifyMode.Off;
        }

        if (!FspiopVerifyMode.isValid(value)) {
            throw new Error(
                `Invalid ${name}: '${value}'. Expected one of `
                + `${FspiopVerifyMode.Off}, ${FspiopVerifyMode.VerifyIfPresent}, ${FspiopVerifyMode.Require}.`,
            );
        }

        return FspiopVerifyMode.parse(value);
    }

    publicKeyStore(): PublicKeyStore {
        return this.inboundPublicKeyStore;
    }

    privateKeyStore(): PrivateKeyStore {
        return this.inboundPrivateKeyStore;
    }

    caStore(): CaStore {
        return this.inboundCaStore;
    }

    clientCertStore(): ClientCertStore {
        return this.inboundClientCertStore;
    }

    private readRequiredString(name: string): string {
        const value = this.configService.get<string>(name);

        if (value == null || value.trim().length === 0) {
            throw new Error(`Missing required environment variable: ${name}`);
        }

        return value;
    }

    private readRequiredBoolean(name: string): boolean {
        const value = this.readRequiredString(name);

        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
            return true;
        }
        if (normalized === 'false' || normalized === '0' || normalized === 'no') {
            return false;
        }

        throw new Error(`Invalid environment variable ${name}: expected a boolean value.`);
    }

    private readPort(name: string): number {
        const value = this.readRequiredString(name);
        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new Error(`Invalid environment variable ${name}: expected a positive integer.`);
        }

        return parsed;
    }

    private readPositiveInteger(name: string): number | undefined {
        const value = this.configService.get<string>(name);

        if (value == null) {
            return undefined;
        }

        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed <= 0) {
            return undefined;
        }

        return parsed;
    }

    /**
     * Where private keys come from. Absent or `database` keeps the legacy plaintext-MySQL path;
     * `vault-kv` is the KMS-backed profile. An unrecognised value throws rather than defaulting —
     * a typo must not silently decide where private keys live.
     */
    keyProvider(): KeyProvider {
        return KeyProvider.parse(this.configService.get<string>('KEY_PROVIDER'), KeyProvider.Database);
    }

    vaultSettings(): VaultSettings {
        return new VaultSettings(
            this.configService.get<string>('VAULT_ADDRESS') ?? '',
            this.configService.get<string>('VAULT_ROLE') ?? '',
            this.configService.get<string>('VAULT_KUBERNETES_AUTH_PATH') ?? 'kubernetes',
            this.configService.get<string>('VAULT_KV_MOUNT') ?? 'secret',
            this.configService.get<string>('VAULT_JWS_KEY_PATH_PREFIX') ?? 'pivotal/jwskey',
            this.configService.get<string>('VAULT_SERVICE_ACCOUNT_TOKEN_PATH')
                ?? VaultSettings.DEFAULT_SERVICE_ACCOUNT_TOKEN_PATH,
            10_000,
            this.readVaultAuthMethod(),
            this.configService.get<string>('VAULT_TOKEN') ?? '',
        );
    }

    /**
     * How this workload authenticates to Vault. Defaults to Kubernetes ServiceAccount auth; the
     * token method exists only so a Vault running outside Kubernetes can be reached during local
     * development, where there is no kubelet to project a ServiceAccount token.
     */
    private readVaultAuthMethod(): VaultAuthMethod {
        const value = this.configService.get<string>('VAULT_AUTH_METHOD');

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

}

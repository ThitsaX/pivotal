// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ConfigService} from '@nestjs/config';
import {TrustDomainModule} from '@core/trust/domain';
import {CentralLedgerAxiosParams} from '@shared/central-ledger';
import {McmSettings} from '@shared/mcm-client';
import {TypeOrmSettings} from '@shared/typeorm';
import {KeyProvider, VaultSettings} from '@shared/vault';

export class TrustManagerSettings implements TrustDomainModule.RequiredSettings {

    private static readonly DEFAULT_PEER_JWS_SYNC_INTERVAL_SECONDS = 300;

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

    vaultSettings(): VaultSettings {
        return new VaultSettings('', '');
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

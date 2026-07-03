// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ConfigService} from '@nestjs/config';
import {CentralLedgerAxiosParams} from '@shared/central-ledger';
import {
    FspiopJwsPrivateKeyStore,
    FspiopJwsPublicKeyStore,
    FspiopMtlsCaStore,
    FspiopMtlsClientCertStore,
    FspiopSettings,
} from '@shared/fspiop';
import {
    CaStore,
    ClientCertStore,
    PrivateKeyStore,
    PublicKeyStore,
} from '@shared/security';
import {TypeOrmSettings} from '@shared/typeorm';
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
        );
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
}

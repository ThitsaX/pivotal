// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ConfigService} from '@nestjs/config';
import {ConnectorConsumerModule} from '@core/connector/consumer';
import {
    Currency,
    FspiopAxiosParams,
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

export class Wallet1ConnectorSettings implements ConnectorConsumerModule.RequiredSettings {

    private static readonly DEFAULT_NATS_URL = 'nats://localhost:4222';
    private static readonly DEFAULT_PARTIES_URL = 'http://localhost:5003';
    private static readonly DEFAULT_QUOTES_URL = 'http://localhost:5003';
    private static readonly DEFAULT_TRANSFERS_URL = 'http://localhost:5003';
    private static readonly DEFAULT_SWITCH_ID = 'switch';
    private static readonly DEFAULT_USE_JWS = false;
    private static readonly DEFAULT_USE_MUTUAL_TLS = false;
    private static readonly DEFAULT_VERIFY_SERVER_CERTIFICATE = true;
    private static readonly DEFAULT_VERIFY_DOMAIN = true;
    private static readonly DEFAULT_CONNECTOR_ID = 'wallet1';
    private static readonly DEFAULT_SUPPORTED_CURRENCIES: Currency[] = [Currency.Usd];
    private static readonly DEFAULT_ILP_SECRET = '';
    private static readonly CURRENCY_CODES = new Set(Object.values(Currency));

    private readonly publicKeyStoreValue: PublicKeyStore;
    private readonly privateKeyStoreValue: PrivateKeyStore;
    private readonly caStoreValue: CaStore;
    private readonly clientCertStoreValue: ClientCertStore;

    constructor(
        private readonly configService: ConfigService,
    ) {

        this.publicKeyStoreValue = new FspiopJwsPublicKeyStore().load();
        this.privateKeyStoreValue = new FspiopJwsPrivateKeyStore().load();
        this.caStoreValue = new FspiopMtlsCaStore().load();
        this.clientCertStoreValue = new FspiopMtlsClientCertStore().load();
    }

    natsUrl(): string {
        return this.configService.get<string>('NATS_URL') ?? Wallet1ConnectorSettings.DEFAULT_NATS_URL;
    }

    fspiopSettings(): FspiopSettings {
        return new FspiopSettings(
            this.readString('FSPIOP_SWITCH_ID', Wallet1ConnectorSettings.DEFAULT_SWITCH_ID),
            this.readString('FSPIOP_PARTIES_URL', Wallet1ConnectorSettings.DEFAULT_PARTIES_URL),
            this.readString('FSPIOP_QUOTES_URL', Wallet1ConnectorSettings.DEFAULT_QUOTES_URL),
            this.readString('FSPIOP_TRANSFERS_URL', Wallet1ConnectorSettings.DEFAULT_TRANSFERS_URL),
            this.readBoolean('FSPIOP_USE_JWS', Wallet1ConnectorSettings.DEFAULT_USE_JWS),
            this.readBoolean('FSPIOP_USE_MUTUAL_TLS', Wallet1ConnectorSettings.DEFAULT_USE_MUTUAL_TLS),
        );
    }

    fspiopAxiosParams(): FspiopAxiosParams {
        const socketTimeoutMs = this.readPositiveInteger('FSPIOP_SOCKET_TIMEOUT_MS');
        const connectionTimeoutMs = this.readPositiveInteger('FSPIOP_CONNECTION_TIMEOUT_MS');
        const verifyServerCertificate = this.readBoolean(
            'FSPIOP_TLS_VERIFY_SERVER_CERT',
            Wallet1ConnectorSettings.DEFAULT_VERIFY_SERVER_CERTIFICATE,
        );
        const verifyDomain = this.readBoolean(
            'FSPIOP_TLS_VERIFY_DOMAIN',
            Wallet1ConnectorSettings.DEFAULT_VERIFY_DOMAIN,
        );

        return {
            socketTimeoutMs,
            connectionTimeoutMs,
            verifyServerCertificate,
            verifyDomain,
        };
    }

    publicKeyStore(): PublicKeyStore {
        return this.publicKeyStoreValue;
    }

    privateKeyStore(): PrivateKeyStore {
        return this.privateKeyStoreValue;
    }

    caStore(): CaStore {
        return this.caStoreValue;
    }

    clientCertStore(): ClientCertStore {
        return this.clientCertStoreValue;
    }

    connectorId(): string {
        return this.readString('CONNECTOR_ID', Wallet1ConnectorSettings.DEFAULT_CONNECTOR_ID);
    }

    supportedCurrencies(): Currency[] {
        return this.readCurrencies('CONNECTOR_SUPPORTED_CURRENCIES', Wallet1ConnectorSettings.DEFAULT_SUPPORTED_CURRENCIES);
    }

    ilpSecret(): string {
        return this.readString('CONNECTOR_ILP_SECRET', Wallet1ConnectorSettings.DEFAULT_ILP_SECRET);
    }

    private readString(name: string, fallback: string): string {
        return this.configService.get<string>(name) ?? fallback;
    }

    private readBoolean(name: string, fallback: boolean): boolean {
        const value = this.configService.get<string>(name);
        if (value == null) {
            return fallback;
        }

        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
            return true;
        }
        if (normalized === 'false' || normalized === '0' || normalized === 'no') {
            return false;
        }

        return fallback;
    }

    private readCurrencies(name: string, fallback: Currency[]): Currency[] {
        const value = this.configService.get<string>(name);
        if (value == null || value.trim() === '') {
            return [...fallback];
        }

        const currencies = value
            .split(',')
            .map((entry) => entry.trim().toUpperCase())
            .filter((entry) => entry.length > 0)
            .filter((entry): entry is Currency => Wallet1ConnectorSettings.CURRENCY_CODES.has(entry as Currency));

        if (currencies.length === 0) {
            return [...fallback];
        }

        return currencies;
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

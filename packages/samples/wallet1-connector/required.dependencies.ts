import {ConfigService} from '@nestjs/config';
import {ConnectorConsumerModule} from '@core/connector/consumer';
import {ConnectorSettings, FspClient} from '@core/connector/domain';
import {Currency, FspiopAxiosParams, FspiopSettings} from '@shared/fspiop';
import {
    CaStore,
    CaStoreFactory,
    ClientCertStore,
    ClientCertStoreFactory,
    PrivateKeyStore,
    PrivateKeyStoreFactory,
    PublicKeyStore,
    PublicKeyStoreFactory,
} from '@shared/security';
import {Wallet1FspClient} from './wallet1-fsp-client';

export class Wallet1ConnectorDependencies implements ConnectorConsumerModule.RequiredDependencies {

    private static readonly DEFAULT_NATS_URL = 'nats://localhost:4222';
    private static readonly DEFAULT_SWITCH_BASE_URL = 'http://localhost:4000';
    private static readonly DEFAULT_SWITCH_ID = 'switch';
    private static readonly DEFAULT_USE_JWS = false;
    private static readonly DEFAULT_USE_MUTUAL_TLS = false;
    private static readonly DEFAULT_PUBLIC_KEY_STORE_FACTORY = 'env';
    private static readonly DEFAULT_PRIVATE_KEY_STORE_FACTORY = 'env';
    private static readonly DEFAULT_CA_STORE_FACTORY = 'env';
    private static readonly DEFAULT_CLIENT_CERT_STORE_FACTORY = 'env';
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

    constructor(private readonly configService: ConfigService = new ConfigService()) {
        this.publicKeyStoreValue = PublicKeyStoreFactory.create(
            this.readString('PUBLIC_KEY_STORE_FACTORY', Wallet1ConnectorDependencies.DEFAULT_PUBLIC_KEY_STORE_FACTORY),
        );
        this.privateKeyStoreValue = PrivateKeyStoreFactory.create(
            this.readString('PRIVATE_KEY_STORE_FACTORY', Wallet1ConnectorDependencies.DEFAULT_PRIVATE_KEY_STORE_FACTORY),
        );
        this.caStoreValue = CaStoreFactory.create(
            this.readString('CA_CERT_STORE_FACTORY', Wallet1ConnectorDependencies.DEFAULT_CA_STORE_FACTORY),
        );
        this.clientCertStoreValue = ClientCertStoreFactory.create(
            this.readString('CLIENT_CERT_STORE_FACTORY', Wallet1ConnectorDependencies.DEFAULT_CLIENT_CERT_STORE_FACTORY),
        );
    }

    natsUrl(): string {
        return this.configService.get<string>('NATS_URL') ?? Wallet1ConnectorDependencies.DEFAULT_NATS_URL;
    }

    fspiopSettings(): FspiopSettings {
        return new FspiopSettings(
            this.readString('FSPIOP_SWITCH_BASE_URL', Wallet1ConnectorDependencies.DEFAULT_SWITCH_BASE_URL),
            this.readString('FSPIOP_SWITCH_ID', Wallet1ConnectorDependencies.DEFAULT_SWITCH_ID),
            this.readBoolean('FSPIOP_USE_JWS', Wallet1ConnectorDependencies.DEFAULT_USE_JWS),
            this.readBoolean('FSPIOP_USE_MUTUAL_TLS', Wallet1ConnectorDependencies.DEFAULT_USE_MUTUAL_TLS),
        );
    }

    fspiopAxiosParams(): FspiopAxiosParams {
        const socketTimeoutMs = this.readPositiveInteger('FSPIOP_SOCKET_TIMEOUT_MS');
        const connectionTimeoutMs = this.readPositiveInteger('FSPIOP_CONNECTION_TIMEOUT_MS');
        const verifyServerCertificate = this.readBoolean(
            'FSPIOP_TLS_VERIFY_SERVER_CERT',
            Wallet1ConnectorDependencies.DEFAULT_VERIFY_SERVER_CERTIFICATE,
        );
        const verifyDomain = this.readBoolean(
            'FSPIOP_TLS_VERIFY_DOMAIN',
            Wallet1ConnectorDependencies.DEFAULT_VERIFY_DOMAIN,
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

    fspClient(): FspClient {
        return new Wallet1FspClient(this.connectorSettings());
    }

    connectorSettings(): ConnectorSettings {
        return new ConnectorSettings(
            this.readString('CONNECTOR_ID', Wallet1ConnectorDependencies.DEFAULT_CONNECTOR_ID),
            this.readCurrencies('CONNECTOR_SUPPORTED_CURRENCIES', Wallet1ConnectorDependencies.DEFAULT_SUPPORTED_CURRENCIES),
            this.readString('CONNECTOR_ILP_SECRET', Wallet1ConnectorDependencies.DEFAULT_ILP_SECRET),
        );
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
            .filter((entry): entry is Currency => Wallet1ConnectorDependencies.CURRENCY_CODES.has(entry as Currency));

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

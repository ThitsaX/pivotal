import {ConfigService} from '@nestjs/config';
import {FspiopAxiosParams, FspiopSettings} from '@shared/fspiop';
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
import type {WebOutboundModule} from './web-outbound.module';

export class WebOutboundDependencies implements WebOutboundModule.RequiredDependencies {

    private static readonly DEFAULT_NATS_URL = 'nats://localhost:4222';
    private static readonly DEFAULT_PARTIES_URL = 'http://localhost:5003';
    private static readonly DEFAULT_QUOTES_URL = 'http://localhost:5003';
    private static readonly DEFAULT_TRANSFERS_URL = 'http://localhost:5003';
    private static readonly DEFAULT_SWITCH_ID = 'switch';
    private static readonly DEFAULT_USE_JWS = false;
    private static readonly DEFAULT_USE_MUTUAL_TLS = false;
    private static readonly DEFAULT_PUBLIC_KEY_STORE_FACTORY = 'env';
    private static readonly DEFAULT_PRIVATE_KEY_STORE_FACTORY = 'env';
    private static readonly DEFAULT_CA_STORE_FACTORY = 'env';
    private static readonly DEFAULT_CLIENT_CERT_STORE_FACTORY = 'env';
    private static readonly DEFAULT_VERIFY_SERVER_CERTIFICATE = true;
    private static readonly DEFAULT_VERIFY_DOMAIN = true;

    private readonly outboundPublicKeyStore: PublicKeyStore;
    private readonly outboundPrivateKeyStore: PrivateKeyStore;
    private readonly outboundCaStore: CaStore;
    private readonly outboundClientCertStore: ClientCertStore;

    constructor(private readonly configService: ConfigService = new ConfigService()) {
        this.outboundPublicKeyStore = PublicKeyStoreFactory.create(
            this.readString('PUBLIC_KEY_STORE_FACTORY', WebOutboundDependencies.DEFAULT_PUBLIC_KEY_STORE_FACTORY),
        );
        this.outboundPrivateKeyStore = PrivateKeyStoreFactory.create(
            this.readString('PRIVATE_KEY_STORE_FACTORY', WebOutboundDependencies.DEFAULT_PRIVATE_KEY_STORE_FACTORY),
        );
        this.outboundCaStore = CaStoreFactory.create(
            this.readString('CA_CERT_STORE_FACTORY', WebOutboundDependencies.DEFAULT_CA_STORE_FACTORY),
        );
        this.outboundClientCertStore = ClientCertStoreFactory.create(
            this.readString('CLIENT_CERT_STORE_FACTORY', WebOutboundDependencies.DEFAULT_CLIENT_CERT_STORE_FACTORY),
        );
    }

    natsUrl(): string {
        return this.readString('NATS_URL', WebOutboundDependencies.DEFAULT_NATS_URL);
    }

    fspiopSettings(): FspiopSettings {
        return new FspiopSettings(
            this.readString('FSPIOP_PARTIES_URL', WebOutboundDependencies.DEFAULT_PARTIES_URL),
            this.readString('FSPIOP_QUOTES_URL', WebOutboundDependencies.DEFAULT_QUOTES_URL),
            this.readString('FSPIOP_TRANSFERS_URL', WebOutboundDependencies.DEFAULT_TRANSFERS_URL),
            this.readString('FSPIOP_SWITCH_ID', WebOutboundDependencies.DEFAULT_SWITCH_ID),
            this.readBoolean('FSPIOP_USE_JWS', WebOutboundDependencies.DEFAULT_USE_JWS),
            this.readBoolean('FSPIOP_USE_MUTUAL_TLS', WebOutboundDependencies.DEFAULT_USE_MUTUAL_TLS),
        );
    }

    fspiopAxiosParams(): FspiopAxiosParams {
        const socketTimeoutMs = this.readPositiveInteger('FSPIOP_SOCKET_TIMEOUT_MS');
        const connectionTimeoutMs = this.readPositiveInteger('FSPIOP_CONNECTION_TIMEOUT_MS');
        const verifyServerCertificate = this.readBoolean(
            'FSPIOP_TLS_VERIFY_SERVER_CERT',
            WebOutboundDependencies.DEFAULT_VERIFY_SERVER_CERTIFICATE,
        );
        const verifyDomain = this.readBoolean(
            'FSPIOP_TLS_VERIFY_DOMAIN',
            WebOutboundDependencies.DEFAULT_VERIFY_DOMAIN,
        );

        return {
            socketTimeoutMs,
            connectionTimeoutMs,
            verifyServerCertificate,
            verifyDomain,
        };
    }

    publicKeyStore(): PublicKeyStore {
        return this.outboundPublicKeyStore;
    }

    privateKeyStore(): PrivateKeyStore {
        return this.outboundPrivateKeyStore;
    }

    caStore(): CaStore {
        return this.outboundCaStore;
    }

    clientCertStore(): ClientCertStore {
        return this.outboundClientCertStore;
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
